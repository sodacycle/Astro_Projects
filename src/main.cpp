#include <QApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QDirIterator>

#include "fitsscanner.h"
#include "fileorganizer.h"
#include "weatherservice.h"
#include "metadatamodel.h"

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);
    app.setApplicationName("FITS Metadata Viewer");
    app.setApplicationVersion("1.0.0");
    app.setOrganizationName("FITSMetadataViewer");
    app.setOrganizationDomain("fitsmetadataviewer.app");

    // ── Backend objects ───────────────────────────────────────────────────────
    // Declared before the engine so they outlive it. C++ destroys stack objects
    // in reverse declaration order, meaning the engine (declared after) is
    // destroyed first — while all backends are still valid. This prevents the
    // "Cannot read property of null" errors that occur when the QML engine
    // evaluates bindings during teardown against already-destroyed C++ objects.
    FitsScanner             scanner;
    FileOrganizer           organizer;
    WeatherService          weatherService;
    MetadataTableModel      metadataModel;
    TargetSummaryModel      targetSummaryModel;
    CalibrationSummaryModel calibrationSummaryModel;
    CatalogModel            catalogModel;

    // ── Engine (destroyed before backends due to declaration order) ───────────
    QQmlApplicationEngine engine;

    QQmlContext *ctx = engine.rootContext();
    ctx->setContextProperty("scanner",                 &scanner);
    ctx->setContextProperty("organizer",               &organizer);
    ctx->setContextProperty("weatherService",          &weatherService);
    ctx->setContextProperty("metadataModel",           &metadataModel);
    ctx->setContextProperty("targetSummaryModel",      &targetSummaryModel);
    ctx->setContextProperty("calibrationSummaryModel", &calibrationSummaryModel);
    ctx->setContextProperty("catalogModel",            &catalogModel);

    // ── Populate models when a scan completes ─────────────────────────────────
    static const QStringList columns = {
        "Frame Type", "File", "Target", "Start Time UTC", "End Time UTC",
        "Exposure Time s", "Number of Subs", "Total Exposure Time s",
        "Telescope", "Camera Model", "Sensor Temperature C", "RA", "DEC",
        "Latitude", "Longitude", "Binning", "Filter Used", "Gain",
        "Focal Length mm", "Aperture mm", "Focus Position", "Image Type",
        "Stacking Software"
    };

    QObject::connect(&scanner, &FitsScanner::scanCompleted,
        [&](const QVariantList &meta, const QVariantList &targets, const QVariantList &cals)
        {
            metadataModel.setData(meta, columns);
            targetSummaryModel.setEntries(targets);
            calibrationSummaryModel.setEntries(cals);
            catalogModel.buildFromTargets(targets);

            for (const QVariant &v : meta) {
                const QVariantMap map = v.toMap();
                const double lat = map.value("Latitude").toString().toDouble();
                const double lon = map.value("Longitude").toString().toDouble();
                if (lat != 0.0 && lon != 0.0) {
                    weatherService.setLocation(lat, lon);
                    const QDate today = QDate::currentDate();
                    weatherService.fetchWeather(today.year(), today.month());
                    break;
                }
            }
        });

    // ── Locate main.qml in the embedded resource system ───────────────────────
    QUrl mainQml;
    {
        QDirIterator it(QStringLiteral(":/"), QDirIterator::Subdirectories);
        while (it.hasNext()) {
            const QString path = it.next();
            if (path.endsWith(QStringLiteral("/qml/main.qml"))) {
                mainQml = QUrl(QStringLiteral("qrc") + path);
                break;
            }
        }
    }

    if (mainQml.isEmpty()) {
        qCritical("Could not locate qml/main.qml in the Qt resource system.");
        return -1;
    }

    QObject::connect(
        &engine, &QQmlApplicationEngine::objectCreated,
        &app,
        [&mainQml](QObject *obj, const QUrl &url) {
            if (!obj && url == mainQml)
                QCoreApplication::exit(-1);
        },
        Qt::QueuedConnection);

    engine.load(mainQml);
    return app.exec();
}
