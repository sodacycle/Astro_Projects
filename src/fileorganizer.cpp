#include "fileorganizer.h"
#include "fitsparser.h"
#include "fitsscanner.h"
#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QRegularExpression>
#include <QDateTime>
#include <QtConcurrent>

static const QSet<QString> PROCESS_SKIP_DIRS = {
    "stacked", "process", "darks", "flats", "bias", "lights"
};

// - File scanning and organization utilities for stacked FITS detection and cleanup -
FileOrganizer::FileOrganizer(QObject *parent) : QObject(parent) {}

bool FileOrganizer::isRunning() const { return m_running; }
int FileOrganizer::progressCurrent() const { return m_progressCurrent; }
int FileOrganizer::progressTotal() const { return m_progressTotal; }
QString FileOrganizer::statusText() const { return m_statusText; }

void FileOrganizer::cancel()
{
    m_canceled.storeRelaxed(1);
}

// - Recursively discover FITS files that appear to be already stacked -
void FileOrganizer::findStackedFiles(const QString &dir, QStringList &list)
{
    if (m_canceled.loadRelaxed()) return;
    QDirIterator it(dir, QDir::Files | QDir::Dirs | QDir::NoDotAndDotDot);
    while (it.hasNext()) {
        if (m_canceled.loadRelaxed()) return;
        QString entryPath = it.next();
        QFileInfo info = it.fileInfo();

        if (info.isDir()) {
            if (!PROCESS_SKIP_DIRS.contains(info.fileName().toLower()))
                findStackedFiles(info.absoluteFilePath(), list);
            continue;
        }

        if (!info.fileName().contains(QRegularExpression("\\.(fit|fits)$", QRegularExpression::CaseInsensitiveOption)))
            continue;

        bool isStacked = false;
        auto header = FitsParser::parseHeader(info.absoluteFilePath());
        isStacked = FitsScanner::metadataIndicatesStacking(header);

        if (!isStacked) {
            isStacked = info.fileName().startsWith("Stacked_") ||
                        info.fileName().startsWith("DSO_Stacked_");
        }

        if (isStacked) list.append(info.absoluteFilePath());
    }
}

// - Recursively locate JPG files for optional deletion -
void FileOrganizer::findJpgFiles(const QString &dir, QStringList &list)
{
    QDirIterator it(dir, QDir::Files | QDir::Dirs | QDir::NoDotAndDotDot);
    while (it.hasNext()) {
        QString entryPath = it.next();
        QFileInfo info = it.fileInfo();
        if (info.isDir()) {
            findJpgFiles(info.absoluteFilePath(), list);
        } else if (info.fileName().contains(QRegularExpression("\\.(jpg|jpeg)$", QRegularExpression::CaseInsensitiveOption))) {
            list.append(info.absoluteFilePath());
        }
    }
}

// - Recursively collect all FITS files while skipping common processed folders -
void FileOrganizer::findFitsFiles(const QString &dir, QStringList &list)
{
    QDirIterator it(dir, QDir::Files | QDir::Dirs | QDir::NoDotAndDotDot);
    while (it.hasNext()) {
        QString entryPath = it.next();
        QFileInfo info = it.fileInfo();
        if (info.isDir()) {
            if (!PROCESS_SKIP_DIRS.contains(info.fileName().toLower()))
                findFitsFiles(info.absoluteFilePath(), list);
        } else if (info.fileName().contains(QRegularExpression("\\.(fit|fits)$", QRegularExpression::CaseInsensitiveOption))) {
            list.append(info.absoluteFilePath());
        }
    }
}

// - Remove empty directories recursively, avoiding the root working folder -
void FileOrganizer::removeEmptyRecursive(const QString &folder, const QString &rootPath, int &deletedCount)
{
    if (m_canceled.loadRelaxed()) return;

    QDirIterator it(folder, QDir::Dirs | QDir::NoDotAndDotDot);
    while (it.hasNext()) {
        if (m_canceled.loadRelaxed()) return;
        removeEmptyRecursive(it.next(), rootPath, deletedCount);
    }

    QDir dir(folder);
    if (dir.entryList(QDir::NoDotAndDotDot | QDir::AllEntries).isEmpty() && folder != rootPath) {
        if (dir.rmdir(folder)) {
            deletedCount++;
            m_statusText = QString("Removed %1 empty folders...").arg(deletedCount);
            emit progressChanged();
        }
    }
}

// - Move identified stacked FITS files into a dedicated Stacked folder -
void FileOrganizer::organizeStacked(const QString &dirPath)
{
    if (m_running) return;
    m_running = true;
    m_canceled.storeRelaxed(0);
    emit runningChanged();

    auto *watcher = new QFutureWatcher<QVariantMap>(this);
    connect(watcher, &QFutureWatcher<QVariantMap>::finished, this, [this, watcher]() {
        emit operationCompleted(watcher->result());
        m_running = false;
        emit runningChanged();
        watcher->deleteLater();
    });

    QFuture<QVariantMap> future = QtConcurrent::run([this, dirPath]() -> QVariantMap {
        QStringList stackedFiles;
        findStackedFiles(dirPath, stackedFiles);
        m_progressTotal = stackedFiles.size();
        m_progressCurrent = 0;
        emit progressChanged();

        QStringList movedFiles;

        for (int i = 0; i < stackedFiles.size(); i++) {
            if (m_canceled.loadRelaxed()) {
                m_canceled.storeRelaxed(0);
                return {{"canceled", true}, {"message", "Operation canceled."}};
            }

            QString filePath = stackedFiles[i];
            QFileInfo info(filePath);

            if (info.dir().dirName().toLower() == "stacked") continue;

            QString stackedDir = info.dir().absolutePath() + "/Stacked";
            QDir().mkpath(stackedDir);

            QString destPath = stackedDir + "/" + info.fileName();

            if (QFile::rename(filePath, destPath)) {
                movedFiles.append(filePath);
            }

            m_progressCurrent = i;
            if (i % 10 == 0) {
                m_statusText = QString("Moving files (%1/%2)...").arg(i).arg(stackedFiles.size());
                emit progressChanged();
            }
        }

        m_statusText = "Stacked file organization complete!";
        emit progressChanged();

        return {
            {"success", true},
            {"movedCount", movedFiles.size()},
            {"message", QString("Moved %1 stacked files into Stacked folders.").arg(movedFiles.size())}
        };
    });

    watcher->setFuture(future);
}

// - Delete JPG files from the selected directory tree -
void FileOrganizer::removeJpg(const QString &dirPath)
{
    if (m_running) return;
    m_running = true;
    m_canceled.storeRelaxed(0);
    emit runningChanged();

    auto *watcher = new QFutureWatcher<QVariantMap>(this);
    connect(watcher, &QFutureWatcher<QVariantMap>::finished, this, [this, watcher]() {
        emit operationCompleted(watcher->result());
        m_running = false;
        emit runningChanged();
        watcher->deleteLater();
    });

    QFuture<QVariantMap> future = QtConcurrent::run([this, dirPath]() -> QVariantMap {
        QStringList jpgFiles;
        findJpgFiles(dirPath, jpgFiles);
        m_progressTotal = jpgFiles.size();
        m_progressCurrent = 0;
        emit progressChanged();

        int deletedCount = 0;
        for (int i = 0; i < jpgFiles.size(); i++) {
            if (m_canceled.loadRelaxed()) {
                m_canceled.storeRelaxed(0);
                return {{"canceled", true}, {"deletedCount", deletedCount}};
            }

            if (QFile::remove(jpgFiles[i])) deletedCount++;

            if (i % 10 == 0) {
                m_progressCurrent = i;
                m_statusText = QString("Deleting JPGs (%1/%2)...").arg(i).arg(jpgFiles.size());
                emit progressChanged();
            }
        }

        m_statusText = "JPG removal complete!";
        emit progressChanged();

        return {{"success", true}, {"deletedCount", deletedCount}};
    });

    watcher->setFuture(future);
}

// - Prepare FITS files into Siril-friendly subfolders based on frame type -
void FileOrganizer::sirilPrep(const QString &dirPath)
{
    if (m_running) return;
    m_running = true;
    m_canceled.storeRelaxed(0);
    emit runningChanged();

    auto *watcher = new QFutureWatcher<QVariantMap>(this);
    connect(watcher, &QFutureWatcher<QVariantMap>::finished, this, [this, watcher]() {
        emit operationCompleted(watcher->result());
        m_running = false;
        emit runningChanged();
        watcher->deleteLater();
    });

    QFuture<QVariantMap> future = QtConcurrent::run([this, dirPath]() -> QVariantMap {
        QStringList fitsFiles;
        findFitsFiles(dirPath, fitsFiles);
        m_progressTotal = fitsFiles.size();
        m_progressCurrent = 0;
        emit progressChanged();

        QMap<QString, QString> subfolderName = {
            {"LIGHT", "lights"}, {"DARK", "darks"}, {"FLAT", "flats"}, {"BIAS", "bias"}
        };

        int movedCount = 0;
        QStringList logLines;

        for (int i = 0; i < fitsFiles.size(); i++) {
            if (m_canceled.loadRelaxed()) {
                m_canceled.storeRelaxed(0);
                return {{"canceled", true}, {"movedCount", movedCount}};
            }

            QString filePath = fitsFiles[i];
            QFileInfo info(filePath);

            auto header = FitsParser::parseHeader(filePath);
            auto [frameType, method] = FitsScanner::detectFrameType(header, info.fileName());

            if (frameType == "LIGHT" && method == "assumed") continue;

            QString destDir = info.dir().absolutePath() + "/" + subfolderName.value(frameType, "unknown");
            QDir().mkpath(destDir);
            QString destPath = destDir + "/" + info.fileName();

            if (QFile::rename(filePath, destPath)) {
                movedCount++;
                logLines.append(QString("[%1] %2 | %3 | %4")
                    .arg(QDateTime::currentDateTime().toString(Qt::ISODate))
                    .arg(frameType, -5)
                    .arg(method, -8)
                    .arg(info.fileName()));
                logLines.append(QString("    FROM: %1").arg(filePath));
                logLines.append(QString("    TO:   %1").arg(destPath));
                logLines.append("");
            }

            if (i % 10 == 0) {
                m_progressCurrent = i;
                m_statusText = QString("Organizing files (%1/%2)...").arg(i).arg(fitsFiles.size());
                emit progressChanged();
            }
        }

        // Write log
        QString logPath = dirPath + "/sirilprep-log.txt";
        QFile logFile(logPath);
        if (logFile.open(QIODevice::WriteOnly | QIODevice::Text)) {
            logFile.write(logLines.join("\n").toUtf8());
            logFile.close();
        }

        m_statusText = "Siril Prep complete!";
        emit progressChanged();

        return {
            {"success", true},
            {"movedCount", movedCount},
            {"message", QString("Organized %1 files into lights/darks/flats/bias subfolders.").arg(movedCount)}
        };
    });

    watcher->setFuture(future);
}

// - Remove empty folders under the directory after file operations complete -
void FileOrganizer::removeEmptyFolders(const QString &dirPath)
{
    if (m_running) return;
    m_running = true;
    m_canceled.storeRelaxed(0);
    emit runningChanged();

    auto *watcher = new QFutureWatcher<QVariantMap>(this);
    connect(watcher, &QFutureWatcher<QVariantMap>::finished, this, [this, watcher]() {
        emit operationCompleted(watcher->result());
        m_running = false;
        emit runningChanged();
        watcher->deleteLater();
    });

    QFuture<QVariantMap> future = QtConcurrent::run([this, dirPath]() -> QVariantMap {
        int deletedCount = 0;
        removeEmptyRecursive(dirPath, dirPath, deletedCount);

        if (m_canceled.loadRelaxed()) {
            m_canceled.storeRelaxed(0);
            return {{"canceled", true}, {"message", "Operation canceled."}};
        }

        m_statusText = "Empty folder removal complete!";
        emit progressChanged();

        return {{"success", true}, {"deletedCount", deletedCount},
                {"message", QString("Removed %1 empty folder(s).").arg(deletedCount)}};
    });

    watcher->setFuture(future);
}
