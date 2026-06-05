#include <QApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QDirIterator>
#include <QLibrary>
#include <cstdlib>

#include "fitsscanner.h"
#include "fileorganizer.h"
#include "weatherservice.h"
#include "metadatamodel.h"

// ── Platform theme detection ──────────────────────────────────────────────────
// Sets QT_QPA_PLATFORMTHEME before QApplication is constructed (the only time
// it is read) if a suitable platform theme plugin is available.
// This gives native GTK theming on GNOME and other GTK desktops without
// requiring the user to configure qt6ct manually.
static void detectPlatformTheme()
{
    // If the user or environment has already set a theme, respect it
    if (qEnvironmentVariableIsSet("QT_QPA_PLATFORMTHEME"))
        return;

    // Prefer the KDE/Plasma integration plugin when running under KDE
    const QByteArray desktop = qgetenv("XDG_CURRENT_DESKTOP").toLower();
    const QByteArray session = qgetenv("DESKTOP_SESSION").toLower();

    const bool isKde    = desktop.contains("kde") || session.contains("plasma");
    const bool isGnome  = desktop.contains("gnome") || desktop.contains("unity");
    const bool isCinnamon = desktop.contains("cinnamon");
    const bool isMate   = desktop.contains("mate");
    const bool isXfce   = desktop.contains("xfce");

    if (isKde) {
        // KDE platform plugin gives full Breeze integration
        if (QLibrary::isLibrary(QStringLiteral("qt6/plugins/platformthemes/libqkde.so")) ||
            QLibrary::isLibrary(QStringLiteral("/usr/lib/qt6/plugins/platformthemes/libqkde.so")))
            qputenv("QT_QPA_PLATFORMTHEME", "kde");
    } else if (isGnome || isCinnamon || isMate || isXfce) {
        // GTK integration plugin gives native GTK file picker and colour scheme
        // Try gtk3 plugin first (wider compatibility), fall back to gtk2
        const QStringList gtkPluginPaths = {
            QStringLiteral("/usr/lib/qt6/plugins/platformthemes/libqgtk3.so"),
            QStringLiteral("/usr/lib/x86_64-linux-gnu/qt6/plugins/platformthemes/libqgtk3.so"),
            QStringLiteral("/usr/lib64/qt6/plugins/platformthemes/libqgtk3.so"),
        };
        for (const QString &p : gtkPluginPaths) {
            if (QLibrary::isLibrary(p)) {
                qputenv("QT_QPA_PLATFORMTHEME", "gtk3");
                break;
            }
        }
    }
}

// ── Wayland detection ─────────────────────────────────────────────────────────
// On GNOME 45+ the default session is Wayland. Qt 6 supports Wayland natively
// but needs the qt6-wayland package. If it is available we prefer it; if not
// we fall back to XWayland (xcb) which works correctly but without native
// Wayland HiDPI and input handling.
static void detectWayland()
{
    if (qEnvironmentVariableIsSet("QT_QPA_PLATFORM"))
        return;

    const QByteArray waylandDisplay = qgetenv("WAYLAND_DISPLAY");
    if (waylandDisplay.isEmpty())
        return; // Not a Wayland session

    // Check if the Wayland platform plugin is available
    const QStringList waylandPluginPaths = {
        QStringLiteral("/usr/lib/qt6/plugins/platforms/libqwayland-generic.so"),
        QStringLiteral("/usr/lib/x86_64-linux-gnu/qt6/plugins/platforms/libqwayland-generic.so"),
        QStringLiteral("/usr/lib64/qt6/plugins/platforms/libqwayland-generic.so"),
    };
    for (const QString &p : waylandPluginPaths) {
        if (QLibrary::isLibrary(p)) {
            qputenv("QT_QPA_PLATFORM", "wayland");
            return;
        }
    }
    // Wayland plugin not found — XWayland fallback is automatic, nothing to set
}

int main(int argc, char *argv[])
{
    // Platform detection must happen before QApplication is constructed
    // because Qt reads QT_QPA_PLATFORMTHEME and QT_QPA_PLATFORM at that point
    detectPlatformTheme();
    detectWayland();

    QApplication app(argc, argv);
    app.setApplicationName("FITS Metadata Viewer");
    app.setApplicationVersion("1.0.0");
    app.setOrganizationName("FITSMetadataViewer");
    app.setOrganizationDomain("fitsmetadataviewer.app");

    // ── Backend objects ───────────────────────────────────────────────────────
    // Declared before the engine so they outlive it. C++ destroys stack objects
    // in reverse declaration order, meaning the engine (declared after) is
    // destroyed first — while all backends are still valid.
    FitsScanner             scanner;
    FileOrganizer           organizer;
    WeatherService          weatherService;
    MetadataTableModel      metadataModel;
    TargetSummaryModel      targetSummaryModel;
    CalibrationSummaryModel calibrationSummaryModel;
    CatalogModel            catalogModel;

    // ── Engine ────────────────────────────────────────────────────────────────
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
