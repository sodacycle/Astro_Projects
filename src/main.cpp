#include <QApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QDirIterator>
#include <QLibrary>
#include <QOperatingSystemVersion>

#include "fitsscanner.h"
#include "fileorganizer.h"
#include "weatherservice.h"
#include "metadatamodel.h"

// ── Platform theme and display server detection (Linux/macOS only) ────────────
// On Windows Qt automatically uses the native Windows style and the Windows
// file dialog — no environment variables need to be set. These functions are
// compiled out entirely on Windows to avoid touching Linux-specific paths.
#if !defined(Q_OS_WIN)

static void detectPlatformTheme()
{
    if (qEnvironmentVariableIsSet("QT_QPA_PLATFORMTHEME"))
        return;

    const QByteArray desktop = qgetenv("XDG_CURRENT_DESKTOP").toLower();
    const QByteArray session = qgetenv("DESKTOP_SESSION").toLower();

    const bool isKde      = desktop.contains("kde")      || session.contains("plasma");
    const bool isGtk      = desktop.contains("gnome")    || desktop.contains("unity")
                         || desktop.contains("cinnamon") || desktop.contains("mate")
                         || desktop.contains("xfce");

    if (isKde) {
        const QStringList kdePaths = {
            QStringLiteral("/usr/lib/qt6/plugins/platformthemes/libqkde6.so"),
            QStringLiteral("/usr/lib/qt6/plugins/platformthemes/libqkde.so"),
            QStringLiteral("/usr/lib/x86_64-linux-gnu/qt6/plugins/platformthemes/libqkde.so"),
        };
        for (const QString &p : kdePaths) {
            if (QLibrary::isLibrary(p)) {
                qputenv("QT_QPA_PLATFORMTHEME",
                        p.contains("libqkde6") ? "kde6" : "kde");
                return;
            }
        }
    } else if (isGtk) {
        const QStringList gtkPaths = {
            QStringLiteral("/usr/lib/qt6/plugins/platformthemes/libqgtk3.so"),
            QStringLiteral("/usr/lib/x86_64-linux-gnu/qt6/plugins/platformthemes/libqgtk3.so"),
            QStringLiteral("/usr/lib64/qt6/plugins/platformthemes/libqgtk3.so"),
        };
        for (const QString &p : gtkPaths) {
            if (QLibrary::isLibrary(p)) {
                qputenv("QT_QPA_PLATFORMTHEME", "gtk3");
                return;
            }
        }
    }
}

static void detectWayland()
{
    if (qEnvironmentVariableIsSet("QT_QPA_PLATFORM"))
        return;

    if (qgetenv("WAYLAND_DISPLAY").isEmpty())
        return;

    const QStringList waylandPaths = {
        QStringLiteral("/usr/lib/qt6/plugins/platforms/libqwayland-generic.so"),
        QStringLiteral("/usr/lib/x86_64-linux-gnu/qt6/plugins/platforms/libqwayland-generic.so"),
        QStringLiteral("/usr/lib64/qt6/plugins/platforms/libqwayland-generic.so"),
    };
    for (const QString &p : waylandPaths) {
        if (QLibrary::isLibrary(p)) {
            qputenv("QT_QPA_PLATFORM", "wayland");
            return;
        }
    }
}

#endif // !Q_OS_WIN

int main(int argc, char *argv[])
{
#if !defined(Q_OS_WIN)
    // Must be called before QApplication reads these variables at construction
    detectPlatformTheme();
    detectWayland();
#endif

    QApplication app(argc, argv);
    app.setApplicationName("FITS Metadata Viewer");
    app.setApplicationVersion("1.0.0");
    app.setOrganizationName("FITSMetadataViewer");
    app.setOrganizationDomain("fitsmetadataviewer.app");

    // ── Backend objects ───────────────────────────────────────────────────────
    // Declared before the engine so they outlive it. C++ destroys stack objects
    // in reverse declaration order, meaning the engine is destroyed first —
    // while all backend objects are still valid — preventing teardown errors.
    FitsScanner             scanner;
    FileOrganizer           organizer;
    WeatherService          weatherService;
    MetadataTableModel      metadataModel;
    TargetSummaryModel      targetSummaryModel;
    CalibrationSummaryModel calibrationSummaryModel;
    CatalogModel            catalogModel;

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
