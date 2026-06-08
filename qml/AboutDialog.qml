import QtQuick
import QtQuick.Controls

Dialog {
    id: root
    parent: Overlay.overlay
    anchors.centerIn: parent
    modal: true
    title: "About FITS Metadata Viewer"
    standardButtons: Dialog.Close

    // Fixed width; height is content-driven.
    implicitWidth: 440

    Column {
        width: parent.width
        spacing: 0

        // ── App name + version badge ──────────────────────────────────────────
        Row {
            width: parent.width
            spacing: 12

            Column {
                spacing: 4
                anchors.verticalCenter: parent.verticalCenter

                Text {
                    text: "FITS Metadata Viewer"
                    font.pixelSize: 22; font.bold: true
                    color: window.sysPal.windowText
                }
                Rectangle {
                    width: versionLabel.implicitWidth + 16; height: 22
                    radius: 11
                    color: window.sysPal.highlight

                    Text {
                        id: versionLabel
                        anchors.centerIn: parent
                        text: "v1.0 Beta"
                        color: window.sysPal.highlightedText
                        font.pixelSize: 11; font.bold: true
                    }
                }
            }
        }
        Item { width: 1; height: 14 }

        // ── Divider ───────────────────────────────────────────────────────────
        Rectangle {
            width: parent.width; height: 1
            color: window.sysPal.mid
        }
        Item { width: 1; height: 14 }

        // ── Description ───────────────────────────────────────────────────────
        Text {
            width: parent.width
            text: "A cross-platform desktop application for astrophotographers. " +
                  "Scan directories of FITS files, review metadata, organize calibration " +
                  "frames, preview images with live stretch controls, and manage your " +
                  "imaging sessions."
            color: window.sysPal.windowText
            font.pixelSize: 13
            wrapMode: Text.WordWrap
            lineHeight: 1.4
        }
        Item { width: 1; height: 18 }

        // ── Info grid ─────────────────────────────────────────────────────────
        Grid {
            width: parent.width
            columns: 2
            columnSpacing: 16
            rowSpacing: 8

            Text { text: "Creator";         color: window.sysPal.placeholderText; font.pixelSize: 12 }
            Text { text: "sodacycle";       color: window.sysPal.windowText;      font.pixelSize: 12 }

            Text { text: "Initial Release"; color: window.sysPal.placeholderText; font.pixelSize: 12 }
            Text { text: "April 2026";      color: window.sysPal.windowText;      font.pixelSize: 12 }

            Text { text: "Platform";        color: window.sysPal.placeholderText; font.pixelSize: 12 }
            Text { text: "Linux · Windows · macOS (Qt 6)";
                   color: window.sysPal.windowText; font.pixelSize: 12 }
        }
        Item { width: 1; height: 18 }

        // ── Divider ───────────────────────────────────────────────────────────
        Rectangle {
            width: parent.width; height: 1
            color: window.sysPal.mid
        }
        Item { width: 1; height: 12 }

        // ── GitHub link ───────────────────────────────────────────────────────
        Row {
            spacing: 8

            Text {
                text: "Source:"
                color: window.sysPal.placeholderText
                font.pixelSize: 12
                anchors.verticalCenter: parent.verticalCenter
            }
            Text {
                text: "<a href='https://github.com/sodacycle/FITS-Metadata-Viewer'>" +
                      "github.com/sodacycle/FITS-Metadata-Viewer</a>"
                textFormat: Text.RichText
                font.pixelSize: 12
                color: window.sysPal.windowText
                onLinkActivated: function(link) { Qt.openUrlExternally(link) }
                HoverHandler { cursorShape: Qt.PointingHandCursor }
            }
        }

        Item { width: 1; height: 6 }
    }
}
