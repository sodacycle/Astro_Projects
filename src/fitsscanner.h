#ifndef FITSCANNER_H
#define FITSCANNER_H

#include <QObject>
#include <QString>
#include <QList>
#include <QVariantMap>
#include <QAtomicInt>

// - Holds a single FITS file metadata row after scanning -
struct MetadataEntry {
    QString frameType;
    QString file;
    QString path;
    QString target;
    QString startTimeUtc;
    QString endTimeUtc;
    double exposureTimeS = 0;
    int numberOfSubs = 1;
    double totalExposureTimeS = 0;
    QString telescope;
    QString cameraModel;
    QString sensorTemperatureC;
    QString ra;
    QString dec;
    QString latitude;
    QString longitude;
    QString binning;
    QString filterUsed;
    QString gain;
    QString focalLengthMm;
    QString apertureMm;
    QString focusPosition;
    QString imageType;
    QString stackingSoftware;

    QVariantMap toVariantMap() const;
};

// - Aggregated summary data for a single target in the scan results -
struct TargetSummaryEntry {
    QString target;
    int fitsCount = 0;
    int filesWithExposure = 0;
    double totalIntegrationTimeS = 0;

    QVariantMap toVariantMap() const;
};

// - Aggregated calibration frame statistics grouped by settings -
struct CalibrationSummaryEntry {
    QString frameType;
    double exposureTimeS = 0;
    QString gain;
    QString binning;
    QString sensorTempC;
    int count = 0;
    QString mostRecent;

    QVariantMap toVariantMap() const;
};

// - Result object returned from background scanning tasks -
struct ScanResult {
    QList<MetadataEntry> metadataList;
    QList<TargetSummaryEntry> targetSummary;
    QList<CalibrationSummaryEntry> calibrationSummary;
    bool canceled = false;
    QString error;
};

// - Scans directories of FITS files and publishes data for QML views -
class FitsScanner : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool running READ isRunning NOTIFY runningChanged)
    Q_PROPERTY(int filesProcessed READ filesProcessed NOTIFY progressChanged)
    Q_PROPERTY(QString statusText READ statusText NOTIFY progressChanged)

    struct FrameTypeResult {
        QString frameType;
        QString method;
    };

public:
    explicit FitsScanner(QObject *parent = nullptr);

    bool isRunning() const;
    int filesProcessed() const;
    QString statusText() const;

    Q_INVOKABLE QString selectDirectory();
    Q_INVOKABLE void scanDirectory(const QString &dirPath);
    Q_INVOKABLE void cancel();

    static bool metadataIndicatesStacking(const QHash<QString, QVariant> &header);
    static QString anyField(const QHash<QString, QVariant> &header,
                            const QStringList &keys,
                            const QString &fallback = "Unknown");
    static QString formatHMS(double totalSeconds);
    static FrameTypeResult detectFrameType(const QHash<QString, QVariant> &header,
                                           const QString &filename);
    static QString extractTargetFromFilename(const QString &filename);
    static QString classifyCatalog(const QString &targetName);

signals:
    void scanCompleted(const QVariantList &metadataList,
                       const QVariantList &targetSummary,
                       const QVariantList &calibrationSummary);
    void scanError(const QString &error);
    void runningChanged();
    void progressChanged();

private:
    void walkDirectory(const QString &dir, QList<MetadataEntry> &results);

    QAtomicInt m_canceled;
    bool m_running = false;
    int m_filesProcessed = 0;
    QString m_statusText;
};

#endif // FITSCANNER_H
