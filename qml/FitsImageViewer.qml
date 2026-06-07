import QtQuick
import QtQuick.Controls

Window {
    id: viewer
    title: filePath !== "" ? "FITS Viewer — " + filePath.split("/").pop() : "FITS Viewer"
    width: 960; height: 720
    minimumWidth: 600; minimumHeight: 450
    color: "#1a1a1a"

    property string filePath: ""

    signal fileDeleted(string path)

    // Call this to open (or switch to) a file
    function openFile(path) {
        filePath = path
        zoomLevel = 1.0    // reset; fitImage() fires once Image.Ready
        visible = true
        raise()
        requestActivate()
    }

    property real zoomLevel: 1.0

    function fitImage() {
        if (imageItem.sourceSize.width <= 0 || imageItem.sourceSize.height <= 0) return
        var sw = (imageArea.width  - 4) / imageItem.sourceSize.width
        var sh = (imageArea.height - 4) / imageItem.sourceSize.height
        zoomLevel = Math.min(sw, sh)
    }

    // ── Toolbar ───────────────────────────────────────────────────────────────
    Rectangle {
        id: toolbar
        anchors.top: parent.top; anchors.left: parent.left; anchors.right: parent.right
        height: 44
        color: "#2b2b2b"

        Row {
            anchors.verticalCenter: parent.verticalCenter
            anchors.left: parent.left; anchors.leftMargin: 10
            spacing: 6

            Button {
                text: "−"; implicitWidth: 32; implicitHeight: 28
                enabled: viewer.zoomLevel > 0.05
                ToolTip.visible: hovered; ToolTip.delay: 500; ToolTip.text: "Zoom out"
                onClicked: viewer.zoomLevel = Math.max(0.05, viewer.zoomLevel - 0.25)
            }

            Text {
                text: Math.round(viewer.zoomLevel * 100) + "%"
                color: "#dddddd"; font.pixelSize: 13; width: 48
                horizontalAlignment: Text.AlignHCenter
                anchors.verticalCenter: parent.verticalCenter
            }

            Button {
                text: "+"; implicitWidth: 32; implicitHeight: 28
                enabled: viewer.zoomLevel < 16.0
                ToolTip.visible: hovered; ToolTip.delay: 500; ToolTip.text: "Zoom in"
                onClicked: viewer.zoomLevel = Math.min(16.0, viewer.zoomLevel + 0.25)
            }

            Button {
                text: "Fit"; implicitWidth: 44; implicitHeight: 28
                ToolTip.visible: hovered; ToolTip.delay: 500; ToolTip.text: "Fit image to window"
                onClicked: viewer.fitImage()
            }

            Button {
                text: "1:1"; implicitWidth: 44; implicitHeight: 28
                ToolTip.visible: hovered; ToolTip.delay: 500; ToolTip.text: "Show at 100% (actual pixels)"
                onClicked: viewer.zoomLevel = 1.0
            }
        }
    }

    // ── Image area ────────────────────────────────────────────────────────────
    Rectangle {
        id: imageArea
        anchors.top: toolbar.bottom; anchors.bottom: footer.top
        anchors.left: parent.left; anchors.right: parent.right
        color: "#111111"
        clip: true

        Flickable {
            id: flickable
            anchors.fill: parent
            clip: true
            // Keep content at least as large as the viewport so centring works
            contentWidth:  Math.max(width,  imgWrap.width)
            contentHeight: Math.max(height, imgWrap.height)

            Item {
                id: imgWrap
                width:  Math.max(1, imageItem.width)
                height: Math.max(1, imageItem.height)
                // Centre image when smaller than the viewport
                x: Math.max(0, (flickable.width  - width)  / 2)
                y: Math.max(0, (flickable.height - height) / 2)

                Image {
                    id: imageItem
                    width:  Math.max(1, sourceSize.width  * viewer.zoomLevel)
                    height: Math.max(1, sourceSize.height * viewer.zoomLevel)
                    fillMode: Image.Stretch
                    smooth: viewer.zoomLevel < 1.5   // nearest-neighbour when zoomed in far
                    asynchronous: true
                    cache: false
                    source: viewer.filePath !== ""
                            ? "image://fitsprovider/" + encodeURIComponent(viewer.filePath)
                            : ""

                    onStatusChanged: {
                        if (status === Image.Ready) viewer.fitImage()
                    }
                }

                // Loading spinner
                BusyIndicator {
                    anchors.centerIn: parent
                    width: 56; height: 56
                    running: imageItem.status === Image.Loading
                }

                // Error message
                Column {
                    anchors.centerIn: parent
                    spacing: 8
                    visible: imageItem.status === Image.Error

                    Text {
                        text: "Could not display image"
                        color: "#cc5555"; font.pixelSize: 15; font.bold: true
                        anchors.horizontalCenter: parent.horizontalCenter
                    }
                    Text {
                        text: "The file may have no pixel data (NAXIS = 0),\n" +
                              "use a compressed or unsupported FITS variant,\n" +
                              "or the data exceeds the 512 MB safety limit."
                        color: "#888888"; font.pixelSize: 12
                        horizontalAlignment: Text.AlignHCenter
                        anchors.horizontalCenter: parent.horizontalCenter
                    }
                }
            }
        }
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    Rectangle {
        id: footer
        anchors.bottom: parent.bottom; anchors.left: parent.left; anchors.right: parent.right
        height: 50
        color: "#2b2b2b"

        Column {
            anchors.verticalCenter: parent.verticalCenter
            anchors.left: parent.left; anchors.leftMargin: 12
            anchors.right: actionRow.left; anchors.rightMargin: 8
            spacing: 2

            Text {
                width: parent.width
                text: viewer.filePath
                color: "#aaaaaa"; font.pixelSize: 11
                elide: Text.ElideMiddle

                ToolTip.visible: footerPathMouse.containsMouse
                ToolTip.delay: 500
                ToolTip.text: viewer.filePath

                MouseArea { id: footerPathMouse; anchors.fill: parent; hoverEnabled: true }
            }

            Text {
                id: deleteError
                text: ""; visible: text !== ""
                color: "#cc4444"; font.pixelSize: 11
                width: parent.width; elide: Text.ElideRight
            }
        }

        Row {
            id: actionRow
            anchors.verticalCenter: parent.verticalCenter
            anchors.right: parent.right; anchors.rightMargin: 12
            spacing: 8

            Button {
                text: "Delete File"
                ToolTip.visible: hovered; ToolTip.delay: 500
                ToolTip.text: "Permanently delete this file from disk.\nA confirmation prompt will appear first."
                onClicked: { deleteError.text = ""; deleteDialog.open() }
            }
            Button {
                text: "Close"
                ToolTip.visible: hovered; ToolTip.delay: 500; ToolTip.text: "Close this viewer"
                onClicked: viewer.visible = false
            }
        }
    }

    // ── Delete confirmation dialog ────────────────────────────────────────────
    Dialog {
        id: deleteDialog
        parent: Overlay.overlay
        anchors.centerIn: parent
        modal: true
        title: "Delete File"
        standardButtons: Dialog.Ok | Dialog.Cancel

        Column {
            spacing: 10; width: 400

            Text {
                width: parent.width
                text: "Permanently delete:\n" + viewer.filePath.split("/").pop()
                color: "#dddddd"; font.pixelSize: 13; wrapMode: Text.WordWrap
            }
            Text {
                width: parent.width
                text: viewer.filePath
                color: "#888888"; font.pixelSize: 11; wrapMode: Text.WrapAnywhere
            }
            Text {
                text: "This action cannot be undone."
                color: "#cc3300"; font.pixelSize: 13; font.bold: true
            }
        }

        onAccepted: {
            if (organizer.deleteFile(viewer.filePath)) {
                viewer.fileDeleted(viewer.filePath)
                viewer.visible = false
            } else {
                deleteError.text = "Could not delete file — check permissions."
            }
        }
    }
}
