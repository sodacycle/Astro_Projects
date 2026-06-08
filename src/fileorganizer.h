#ifndef FILEORGANIZER_H
#define FILEORGANIZER_H

#include <QObject>
#include <QString>
#include <QAtomicInt>

// - Helper object for organizing FITS files, deleting JPGs, and preparing files for Siril -
class FileOrganizer : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool running READ isRunning NOTIFY runningChanged)
    Q_PROPERTY(int progressCurrent READ progressCurrent NOTIFY progressChanged)
    Q_PROPERTY(int progressTotal READ progressTotal NOTIFY progressChanged)
    Q_PROPERTY(QString statusText READ statusText NOTIFY progressChanged)

public:
    explicit FileOrganizer(QObject *parent = nullptr);

    bool isRunning() const;
    int progressCurrent() const;
    int progressTotal() const;
    QString statusText() const;

    Q_INVOKABLE void organizeStacked(const QString &dirPath);
    Q_INVOKABLE void scanJpg(const QString &dirPath);
    Q_INVOKABLE void removeJpg(const QString &dirPath);
    Q_INVOKABLE void sirilPrep(const QString &dirPath);
    Q_INVOKABLE void removeEmptyFolders(const QString &dirPath);
    Q_INVOKABLE bool deleteFile(const QString &filePath);
    Q_INVOKABLE QString rejectFile(const QString &filePath);
    Q_INVOKABLE void cancel();

signals:
    void operationCompleted(const QVariantMap &result);
    void operationError(const QString &error);
    void fileProcessed(const QString &message);
    void runningChanged();
    void progressChanged();

private:
    void findStackedFiles(const QString &dir, QStringList &list);
    void findJpgFiles(const QString &dir, QStringList &list);
    void findFitsFiles(const QString &dir, QStringList &list);
    void removeEmptyRecursive(const QString &folder, const QString &rootPath, int &deletedCount);

    QAtomicInt m_canceled;
    bool m_running = false;
    int m_progressCurrent = 0;
    int m_progressTotal = 0;
    QString m_statusText;
};

#endif // FILEORGANIZER_H
