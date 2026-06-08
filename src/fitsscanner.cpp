#include "fitsscanner.h"
#include "fitsparser.h"
#include <QDirIterator>
#include <QFileInfo>
#include <QDateTime>
#include <QtConcurrent>
#include <QRegularExpression>
#include <QSet>
#include <QFileDialog>

// - Known stacking software identifiers and directory names to skip during scanning -
static const QStringList STACKING_SOFTWARE = {
    "siril", "deepskystacker", "pixinsight", "astropixelprocessor",
    "autostakkert", "registax", "sequator", "starry landscape stacker"
};

static const QSet<QString> SCAN_SKIP_DIRS = { "stacked", "process", "darks", "flats", "bias", "rejected" };

// - Convert scanned metadata entry objects into a QVariantMap for the QML model -
QVariantMap MetadataEntry::toVariantMap() const
{
    return {
        {"Frame Type", frameType},
        {"File", file},
        {"Path", path},
        {"Target", target},
        {"Start Time UTC", startTimeUtc},
        {"End Time UTC", endTimeUtc},
        {"Exposure Time s", exposureTimeS},
        {"Number of Subs", numberOfSubs},
        {"Total Exposure Time s", totalExposureTimeS},
        {"Telescope", telescope},
        {"Camera Model", cameraModel},
        {"Sensor Temperature C", sensorTemperatureC},
        {"RA", ra},
        {"DEC", dec},
        {"Latitude", latitude},
        {"Longitude", longitude},
        {"Binning", binning},
        {"Filter Used", filterUsed},
        {"Gain", gain},
        {"Focal Length mm", focalLengthMm},
        {"Aperture mm", apertureMm},
        {"Focus Position", focusPosition},
        {"Image Type", imageType},
        {"Stacking Software", stackingSoftware}
    };
}

// - Convert target summary entries into maps consumable by QML -
QVariantMap TargetSummaryEntry::toVariantMap() const
{
    return {
        {"Target", target},
        {"FITS Count", fitsCount},
        {"Files With Exposure", filesWithExposure},
        {"Total Integration Time", FitsScanner::formatHMS(totalIntegrationTimeS)}
    };
}

// - Convert calibration summary entries into QML-friendly map objects -
QVariantMap CalibrationSummaryEntry::toVariantMap() const
{
    return {
        {"Frame Type", frameType},
        {"Exposure Time s", exposureTimeS},
        {"Gain", gain},
        {"Binning", binning},
        {"Sensor Temp C", sensorTempC},
        {"Count", count},
        {"Most Recent", mostRecent}
    };
}

// ---- FitsScanner lifecycle and status helpers ----
FitsScanner::FitsScanner(QObject *parent) : QObject(parent) {}

bool FitsScanner::isRunning() const { return m_running; }
int FitsScanner::filesProcessed() const { return m_filesProcessed; }
QString FitsScanner::statusText() const { return m_statusText; }

// - Heuristic checks for stacked FITS files based on header values and known software -
bool FitsScanner::metadataIndicatesStacking(const QHash<QString, QVariant> &header)
{
    if (header.isEmpty()) return false;

    QStringList stackCountKeys = {"STACKCNT", "NFRAMES", "NSTACK", "FRAMES"};
    for (const auto &key : stackCountKeys) {
        if (header.contains(key)) {
            bool ok;
            int val = header[key].toInt(&ok);
            if (ok && val > 1) return true;
        }
    }

    QStringList stackFlagKeys = {"STACKTYP", "STACKED", "COMBINED"};
    for (const auto &key : stackFlagKeys) {
        if (header.contains(key) && !header[key].isNull())
            return true;
    }

    if (header.contains("CREATOR")) return false;

    QStringList softwareKeys = {"PROGRAM", "SOFTWARE", "HISTORY", "COMMENT"};
    for (const auto &key : softwareKeys) {
        if (!header.contains(key)) continue;
        QString val = header[key].toString().toLower();
        for (const auto &sw : STACKING_SOFTWARE) {
            if (val.contains(sw)) return true;
        }
    }

    return false;
}

// - Return the first non-empty FITS header value from a list of possible keys -
QString FitsScanner::anyField(const QHash<QString, QVariant> &header,
                              const QStringList &keys,
                              const QString &fallback)
{
    for (const auto &key : keys) {
        if (header.contains(key)) {
            QVariant val = header[key];
            if (!val.isNull() && val.isValid() && val.toString() != "")
                return val.toString();
        }
    }
    return fallback;
}

// - Format a total exposure duration into human-readable hours/minutes/seconds -
QString FitsScanner::formatHMS(double totalSeconds)
{
    int hours = static_cast<int>(totalSeconds) / 3600;
    int minutes = (static_cast<int>(totalSeconds) % 3600) / 60;
    int seconds = static_cast<int>(totalSeconds) % 60;
    QString result;
    if (hours > 0) result += QString("%1h ").arg(hours);
    if (minutes > 0) result += QString("%1m ").arg(minutes);
    result += QString("%1s").arg(seconds);
    return result.trimmed();
}

// - Determine the FITS frame type from header metadata or filename clues -
FitsScanner::FrameTypeResult FitsScanner::detectFrameType(
    const QHash<QString, QVariant> &header, const QString &filename)
{
    QString imgtyp = anyField(header, {"IMAGETYP", "IMTYPE", "FRAME", "TYPE"}).toUpper();
    if (imgtyp.contains("LIGHT")) return {"LIGHT", "metadata"};
    if (imgtyp.contains("DARK"))  return {"DARK", "metadata"};
    if (imgtyp.contains("FLAT"))  return {"FLAT", "metadata"};
    if (imgtyp.contains("BIAS"))  return {"BIAS", "metadata"};

    QString f = filename.toUpper();
    if (f.startsWith("LIGHT_"))                                return {"LIGHT", "filename-prefix"};
    if (f.startsWith("DARK_")  || f.startsWith("DSO_DARK_"))  return {"DARK", "filename-prefix"};
    if (f.startsWith("FLAT_")  || f.startsWith("DSO_FLAT_"))  return {"FLAT", "filename-prefix"};
    if (f.startsWith("BIAS_"))                                 return {"BIAS", "filename-prefix"};

    QString stem = f;
    stem.replace(QRegularExpression("\\.(FITS?)$"), "");
    stem.replace(QRegularExpression("[^A-Z]+"), " ");
    stem = stem.trimmed();

    auto hasWord = [&](const QString &w) {
        return stem.split(" ", Qt::SkipEmptyParts).contains(w);
    };

    if (hasWord("LIGHT") || hasWord("LIGHTS"))  return {"LIGHT", "filename-substring"};
    if (hasWord("DARK")  || hasWord("DARKS"))   return {"DARK", "filename-substring"};
    if (hasWord("FLAT")  || hasWord("FLATS"))   return {"FLAT", "filename-substring"};
    if (hasWord("BIAS")  || hasWord("BIASES"))  return {"BIAS", "filename-substring"};

    return {"LIGHT", "assumed"};
}

// - Try to extract target name from a filename pattern if present -
QString FitsScanner::extractTargetFromFilename(const QString &filename)
{
    QRegularExpression re("^Light_(.+?)_\\d+\\.\\d+s_");
    auto match = re.match(filename);
    if (match.hasMatch()) {
        return match.captured(1).replace("_", " ");
    }
    return {};
}

// - Determine which catalog a target belongs to for summary grouping -
QString FitsScanner::classifyCatalog(const QString &targetName)
{
    QString name = targetName.toUpper().trimmed();
    name.replace("MOSAIC", "").replace("PANEL", "");
    name.replace("-", " ");
    name = name.simplified();

    if (name.startsWith("M ")) return "Messier";
    if (name.startsWith("NGC")) return "NGC";
    if (name.startsWith("IC")) return "IC";
    if (name.startsWith("CALDWELL")) return "Caldwell";
    if (name.startsWith("SH2") || name.startsWith("SH ")) return "Sharpless";
    if (name.startsWith("BARNARD") || name.startsWith("B ")) return "Barnard";
    if (name.startsWith("LDN")) return "LDN";
    if (name.startsWith("LBN")) return "LBN";
    if (name.startsWith("ABELL")) return "Abell";
    if (name.startsWith("PGC")) return "PGC";
    if (name.startsWith("UGC")) return "UGC";
    return "Other";
}

// - Walk a directory tree and build metadata entries for each FITS file found -
void FitsScanner::walkDirectory(const QString &dir, QList<MetadataEntry> &results)
{    if (m_canceled.loadRelaxed()) return;

    QDirIterator it(dir, QDir::Files | QDir::Dirs | QDir::NoDotAndDotDot);
    while (it.hasNext()) {
        if (m_canceled.loadRelaxed()) return;

        QString entryPath = it.next();
        QFileInfo info = it.fileInfo();

        if (info.isDir()) {
            if (!SCAN_SKIP_DIRS.contains(info.fileName().toLower()))
                walkDirectory(info.absoluteFilePath(), results);
            continue;
        }

        if (!info.fileName().contains(QRegularExpression("\\.(fit|fits)$", QRegularExpression::CaseInsensitiveOption)))
            continue;

        m_filesProcessed++;
        if (m_filesProcessed % 10 == 0) {
            m_statusText = QString("Processing file %1...").arg(m_filesProcessed);
            emit progressChanged();
        }

        auto header = FitsParser::parseHeader(info.absoluteFilePath());

        // Detect frame type first so calibration frames are never discarded by
        // the stacking heuristic — dark/flat/bias files are not stacked light frames.
        auto [frameType, method] = detectFrameType(header, info.fileName());

        bool isStacked = false;
        if (frameType == "LIGHT") {
            isStacked = metadataIndicatesStacking(header);
            if (!isStacked) {
                const QString &fname = info.fileName();
                isStacked = fname.startsWith("Stacked_") || fname.startsWith("DSO_Stacked_");
            }
        }

        if (isStacked) continue;

        MetadataEntry entry;
        entry.frameType = frameType;
        entry.file = info.fileName();
        entry.path = info.absoluteFilePath();

        QString targetFromFilename = extractTargetFromFilename(info.fileName());
        if (!targetFromFilename.isEmpty()) {
            entry.target = targetFromFilename;
        } else {
            entry.target = anyField(header, {"OBJECT", "TARGET", "TITLE"}, "Unknown");
        }

        // Normalize mosaic/panel variants so that "NGC 7000 Mosaic", "NGC 7000 Panel 1",
        // and plain "NGC 7000" are all treated as the same target. The regex is not
        // anchored to $ so Qt's remove() strips every occurrence in one pass.
        {
            static const QRegularExpression mosaicTerm(
                R"([\s_\-]*(mosaic|panel|pano|panorama)[\s_\-]*\d*)",
                QRegularExpression::CaseInsensitiveOption);
            QString normalized = entry.target;
            normalized.remove(mosaicTerm);
            normalized = normalized.simplified();
            if (!normalized.isEmpty())
                entry.target = normalized;
        }

        entry.exposureTimeS = anyField(header, {"EXPTIME", "EXPOSURE", "EXPOSURE_TIME"}, "0").toDouble();
        entry.numberOfSubs = anyField(header, {"STACKCNT", "NFRAMES", "NSTACK", "FRAMES"}, "1").toInt();

        if (header.contains("TOTALEXP")) {
            entry.totalExposureTimeS = header["TOTALEXP"].toDouble();
        } else {
            entry.totalExposureTimeS = entry.numberOfSubs * entry.exposureTimeS;
        }

        QString startTime = anyField(header, {"DATE-OBS", "DATEOBS", "DATE_OBS", "DATE"}, "Unknown");
        entry.startTimeUtc = startTime;
        QDateTime dt = QDateTime::fromString(startTime, Qt::ISODate);
        if (dt.isValid()) {
            entry.startTimeUtc = dt.toString("yyyy-MM-dd HH:mm:ss");
            QDateTime endDt = dt.addSecs(static_cast<qint64>(entry.totalExposureTimeS));
            entry.endTimeUtc = endDt.toString("yyyy-MM-dd HH:mm:ss");
        }

        entry.cameraModel = anyField(header, {"CREATOR", "INSTRUME", "CAMERA", "CAM"}, "Unknown");
        entry.telescope = anyField(header, {"TELESCOP", "TELESCOPE"}, "Unknown");
        if (entry.telescope == "Unknown") entry.telescope = entry.cameraModel;

        entry.sensorTemperatureC = anyField(header, {"CCD-TEMP", "CCD_TEMP"}, "Unknown");
        entry.ra = anyField(header, {"RA"}, "Unknown");
        entry.dec = anyField(header, {"DEC"}, "Unknown");
        entry.latitude = anyField(header, {"SITELAT", "LATITUDE", "OBS-LAT"}, "Unknown");
        entry.longitude = anyField(header, {"SITELONG", "LONGITUDE", "OBS-LONG"}, "Unknown");
        entry.binning = QString("%1x%2")
            .arg(anyField(header, {"XBINNING"}, "1"))
            .arg(anyField(header, {"YBINNING"}, "1"));
        entry.filterUsed = anyField(header, {"FILTER", "FILTER1"}, "Unknown");
        entry.gain = anyField(header, {"GAIN"}, "Unknown");
        entry.focalLengthMm = anyField(header, {"FOCALLEN", "FOCAL_LENGTH"}, "Unknown");
        entry.apertureMm = anyField(header, {"APERTURE"}, "Unknown");
        entry.focusPosition = anyField(header, {"FOCUSPOS", "FOCUS_POSITION"}, "Unknown");
        entry.imageType = anyField(header, {"IMAGETYP", "IMTYPE"}, "Unknown");
        entry.stackingSoftware = anyField(header, {"CREATOR", "SOFTWARE", "STACKING_SOFTWARE"}, "Unknown");

        results.append(entry);
    }
}

QString FitsScanner::selectDirectory()
{
    QString dir = QFileDialog::getExistingDirectory(nullptr,
        "Select Directory with FITS Files");
    if (!dir.isEmpty()) {
        m_statusText = "Directory selected. Ready to scan.";
        emit progressChanged();
    }
    return dir;
}

// - Start an asynchronous scan of a FITS directory and publish the results to QML -
void FitsScanner::scanDirectory(const QString &dirPath)
{
    if (m_running) return;
    m_running = true;
    m_canceled.storeRelaxed(0);
    m_filesProcessed = 0;
    emit runningChanged();

    auto *watcher = new QFutureWatcher<ScanResult>(this);
    connect(watcher, &QFutureWatcher<ScanResult>::finished, this, [this, watcher]() {
        ScanResult result = watcher->result();
        if (!result.error.isEmpty()) {
            emit scanError(result.error);
        } else {
            QVariantList metaList, targetList, calList;
            for (const auto &e : result.metadataList)
                metaList.append(e.toVariantMap());
            for (const auto &e : result.targetSummary)
                targetList.append(e.toVariantMap());
            for (const auto &e : result.calibrationSummary)
                calList.append(e.toVariantMap());
            emit scanCompleted(metaList, targetList, calList);
        }
        m_running = false;
        emit runningChanged();
        watcher->deleteLater();
    });

    QFuture<ScanResult> future = QtConcurrent::run([this, dirPath]() -> ScanResult {
        ScanResult result;

        QList<MetadataEntry> metadataList;
        m_statusText = "Scanning files...";
        emit progressChanged();

        walkDirectory(dirPath, metadataList);

        if (m_canceled.loadRelaxed()) {
            m_canceled.storeRelaxed(0);
            result.canceled = true;
            return result;
        }

        m_statusText = "Aggregating data...";
        emit progressChanged();

        // Build target summary (light frames only)
        QMap<QString, TargetSummaryEntry> targets;
        for (const auto &e : metadataList) {
            if (e.frameType != "LIGHT") continue;
            QString name = e.target.isEmpty() ? "Unknown" : e.target;
            auto &t = targets[name];
            t.target = name;
            t.fitsCount++;
            if (!std::isnan(e.totalExposureTimeS) && e.totalExposureTimeS > 0) {
                t.totalIntegrationTimeS += e.totalExposureTimeS;
                t.filesWithExposure++;
            }
        }

        for (auto &t : targets)
            result.targetSummary.append(t);

        // Build calibration summary
        QMap<QString, CalibrationSummaryEntry> calGroups;
        QSet<QString> calTypes = {"DARK", "FLAT", "BIAS"};

        for (const auto &e : metadataList) {
            if (!calTypes.contains(e.frameType)) continue;

            QString key = QString("%1|%2|%3|%4|%5")
                .arg(e.frameType)
                .arg(e.exposureTimeS)
                .arg(e.gain)
                .arg(e.binning)
                .arg(e.sensorTemperatureC);

            auto &c = calGroups[key];
            c.frameType = e.frameType;
            c.exposureTimeS = e.exposureTimeS;
            c.gain = e.gain;
            c.binning = e.binning;
            c.sensorTempC = e.sensorTemperatureC;
            c.count++;

            if (e.startTimeUtc != "Unknown" && e.startTimeUtc > c.mostRecent)
                c.mostRecent = e.startTimeUtc;
        }

        // Sort calibration: DARK, FLAT, BIAS
        auto calList = calGroups.values();
        QMap<QString, int> typeOrder = {{"DARK", 0}, {"FLAT", 1}, {"BIAS", 2}};
        std::sort(calList.begin(), calList.end(), [&](const auto &a, const auto &b) {
            return typeOrder.value(a.frameType, 9) < typeOrder.value(b.frameType, 9);
        });

        for (auto &c : calList) {
            if (c.mostRecent.isEmpty()) c.mostRecent = "Unknown";
            result.calibrationSummary.append(c);
        }

        result.metadataList = metadataList;
        return result;
    });

    watcher->setFuture(future);
}

void FitsScanner::cancel()
{
    m_canceled.storeRelaxed(1);
}
