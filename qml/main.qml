import QtQuick
import QtQuick.Controls

ApplicationWindow {
    id: window
    title: "FITS Metadata Viewer v1.0 Beta"
    width: 1100
    height: 1000
    minimumWidth: 800
    minimumHeight: 600
    visible: true

    // Use the system window background color — picks up KDE/GTK theme
    color: palette.window

    property string selectedDirectory: ""
    property var    fullMetadataList:  []
    property bool   scanCompleted:     false

    // Single SystemPalette instance shared by all child panels via window.sysPal
    // Qt automatically updates this when the user changes the desktop theme.
    SystemPalette {
        id: sysPalette
        colorGroup: SystemPalette.Active
    }

    // Expose palette to child QML via the window id so panels don't each
    // need their own SystemPalette object.
    readonly property SystemPalette sysPal: sysPalette

    ScrollView {
        id: scrollView
        anchors.fill: parent
        clip: true
        ScrollBar.horizontal.policy: ScrollBar.AlwaysOff

        Column {
            width: scrollView.width
            spacing: 8
            topPadding: 12
            bottomPadding: 16

            ControlsPanel {
                id: controlsPanel
                anchors.left:    parent.left
                anchors.right:   parent.right
                anchors.margins: 12
                onJpgScanned: function(rows) {
                    fileDetailsView.allRows = rows
                }
                onJpgCleared: {
                    fileDetailsView.allRows = window.fullMetadataList
                    imagingCalendar.activeCatalogFilter = ""
                    imagingCalendar.activeTargetFilter  = ""
                    imagingCalendar.buildCalendar(window.fullMetadataList)
                }
            }
            TargetSummaryView {
                id: targetSummaryView
                anchors.left:    parent.left
                anchors.right:   parent.right
                anchors.margins: 12
                onTargetSelected: function(name) {
                    imagingCalendar.activeTargetFilter  = name
                    imagingCalendar.activeCatalogFilter = ""
                    imagingCalendar.buildCalendar(window.fullMetadataList)
                    fileDetailsView.filterByTarget(name)
                }
            }
            CatalogBreakdown {
                id: catalogBreakdown
                anchors.left:    parent.left
                anchors.right:   parent.right
                anchors.margins: 12
                onCatalogSelected: function(name) {
                    imagingCalendar.activeCatalogFilter = name
                    imagingCalendar.activeTargetFilter  = ""
                    imagingCalendar.buildCalendar(window.fullMetadataList)
                    fileDetailsView.filterByCatalog(name)
                }
            }
            ImagingCalendar {
                id: imagingCalendar
                anchors.left:    parent.left
                anchors.right:   parent.right
                anchors.margins: 12
            }
            CalibrationSummaryView {
                id: calibrationSummaryView
                anchors.left:    parent.left
                anchors.right:   parent.right
                anchors.margins: 12
            }
            FileDetailsView {
                id: fileDetailsView
                anchors.left:    parent.left
                anchors.right:   parent.right
                anchors.margins: 12
                height: 500
                onShowAllRequested: {
                    imagingCalendar.activeCatalogFilter = ""
                    imagingCalendar.activeTargetFilter  = ""
                    imagingCalendar.buildCalendar(window.fullMetadataList)
                }
                onFileOpenRequested: function(path, name) {
                    fitsViewer.openFile(path)
                }
            }
        }
    }

    // Separate OS window for viewing individual FITS files
    FitsImageViewer {
        id: fitsViewer
        transientParent: window
        onFileDeleted: function(path) {
            fileDetailsView.removeRow(path)
        }
    }

    Connections {
        target: scanner
        function onScanCompleted(metaList, targetList, calList) {
            window.fullMetadataList = metaList
            window.scanCompleted    = true
            controlsPanel.setStatus("Found " + metaList.length + " FITS files.")
            fileDetailsView.allRows = metaList
            imagingCalendar.buildCalendar(metaList)
        }
        function onScanError(error) {
            controlsPanel.setStatus("Scan error: " + error)
        }
    }
}
