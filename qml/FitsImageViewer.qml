import QtQuick
import QtQuick.Controls

Window {
    id: viewer
    title: filePath !== "" ? "FITS Viewer — " + filePath.split("/").pop() : "FITS Viewer"
    width: 1120; height: 720
    minimumWidth: 760; minimumHeight: 480
    color: "#1a1a1a"

    property string filePath: ""
    property int    fileIndex: -1
    property int    fileCount: 0
    property bool   isRejected: false
    property int    rejectedCount: 0

    // Stretch / denoise parameters — persist across Prev/Next navigation.
    property real stretchA:    0.1
    property real stretchP:    99.0
    property int  denoiseRadius: 0

    signal fileDeleted(string path)
    signal requestToggleReject()
    signal finalizeAccepted()
    signal requestPrevious()
    signal requestNext()

    function openFile(path) {
        filePath  = path
        zoomLevel = 1.0
        visible = true
        raise()
        requestActivate()
    }

    property real zoomLevel: 1.0

    Shortcut { sequence: "Left";  onActivated: { if (viewer.fileIndex > 0) viewer.requestPrevious() } }
    Shortcut { sequence: "Right"; onActivated: { if (viewer.fileIndex < viewer.fileCount - 1) viewer.requestNext() } }

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

        // Left: zoom controls
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

        // Right: navigation + close
        Row {
            anchors.verticalCenter: parent.verticalCenter
            anchors.right: parent.right; anchors.rightMargin: 10
            spacing: 6

            Button {
                text: "‹ Prev"; implicitWidth: 64; implicitHeight: 28
                enabled: viewer.fileIndex > 0
                ToolTip.visible: hovered; ToolTip.delay: 500; ToolTip.text: "Previous image  (←)"
                onClicked: viewer.requestPrevious()
            }
            Text {
                text: viewer.fileCount > 0 ? (viewer.fileIndex + 1) + " / " + viewer.fileCount : ""
                color: "#aaaaaa"; font.pixelSize: 12; width: 52
                horizontalAlignment: Text.AlignHCenter
                anchors.verticalCenter: parent.verticalCenter
            }
            Button {
                text: "Next ›"; implicitWidth: 64; implicitHeight: 28
                enabled: viewer.fileIndex >= 0 && viewer.fileIndex < viewer.fileCount - 1
                ToolTip.visible: hovered; ToolTip.delay: 500; ToolTip.text: "Next image  (→)"
                onClicked: viewer.requestNext()
            }
            Button {
                text: "Close"; implicitWidth: 58; implicitHeight: 28
                ToolTip.visible: hovered; ToolTip.delay: 500; ToolTip.text: "Close this viewer"
                onClicked: viewer.visible = false
            }
        }
    }

    // ── Side panel ─────────────────────────────────────────────────────────────
    Rectangle {
        id: sidePanel
        anchors.top: toolbar.bottom; anchors.bottom: footer.top
        anchors.left: parent.left
        width: 210
        color: "#242424"

        // Top section: stretch + denoise sliders
        Column {
            id: controlsCol
            anchors.top: parent.top; anchors.topMargin: 14
            anchors.left: parent.left; anchors.leftMargin: 10
            anchors.right: parent.right; anchors.rightMargin: 10
            spacing: 4

            // ── Stretch (a) ──────────────────────────────────────────────────
            Item {
                width: parent.width; height: 16
                Text {
                    anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter
                    text: "Stretch (a)"; color: "#aaaaaa"; font.pixelSize: 11
                    ToolTip.visible: saLbl.containsMouse; ToolTip.delay: 400
                    ToolTip.text: "AsinhStretch knee.\nSmaller → more aggressive (faint detail, more noise).\nLarger → gentler, more linear."
                    MouseArea { id: saLbl; anchors.fill: parent; hoverEnabled: true }
                }
                Text {
                    anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
                    text: viewer.stretchA.toFixed(3)
                    color: "#ffffff"; font.pixelSize: 11; font.family: "monospace"
                }
            }
            Slider {
                width: parent.width
                from: 0.01; to: 2.0; stepSize: 0.01
                value: viewer.stretchA
                onMoved: viewer.stretchA = value
            }

            Item { width: 1; height: 6 }

            // ── Clip (%) ─────────────────────────────────────────────────────
            Item {
                width: parent.width; height: 16
                Text {
                    anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter
                    text: "Clip (%)"; color: "#aaaaaa"; font.pixelSize: 11
                    ToolTip.visible: clipLbl.containsMouse; ToolTip.delay: 400
                    ToolTip.text: "PercentileInterval clip level.\nLower → clips more bright outliers.\n99.0% = top/bottom 0.5% each."
                    MouseArea { id: clipLbl; anchors.fill: parent; hoverEnabled: true }
                }
                Text {
                    anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
                    text: viewer.stretchP.toFixed(1) + "%"
                    color: "#ffffff"; font.pixelSize: 11; font.family: "monospace"
                }
            }
            Slider {
                width: parent.width
                from: 90.0; to: 99.9; stepSize: 0.1
                value: viewer.stretchP
                onMoved: viewer.stretchP = value
            }

            Item { width: 1; height: 6 }

            // ── Denoise ──────────────────────────────────────────────────────
            Item {
                width: parent.width; height: 16
                Text {
                    anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter
                    text: "Denoise"; color: "#aaaaaa"; font.pixelSize: 11
                    ToolTip.visible: dnLbl.containsMouse; ToolTip.delay: 400
                    ToolTip.text: "Box blur radius applied after stretching.\n0 = off.  Higher values smooth noise\nbut also soften fine star detail."
                    MouseArea { id: dnLbl; anchors.fill: parent; hoverEnabled: true }
                }
                Text {
                    anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
                    text: viewer.denoiseRadius === 0 ? "Off" : ("r" + viewer.denoiseRadius)
                    color: "#ffffff"; font.pixelSize: 11; font.family: "monospace"
                }
            }
            Slider {
                width: parent.width
                from: 0; to: 5; stepSize: 1
                value: viewer.denoiseRadius
                onMoved: viewer.denoiseRadius = Math.round(value)
            }

            Item { width: 1; height: 10 }

            Button {
                width: parent.width; implicitHeight: 28
                text: "Reset"
                ToolTip.visible: hovered; ToolTip.delay: 400
                ToolTip.text: "Reset to defaults: a=0.10, clip=99.0%, denoise=off"
                onClicked: { viewer.stretchA = 0.1; viewer.stretchP = 99.0; viewer.denoiseRadius = 0 }
            }

            Item { width: 1; height: 6 }

            Text {
                width: parent.width
                text: "These adjustments are for viewing only and are not saved to the file."
                color: "#777777"; font.pixelSize: 10
                wrapMode: Text.WordWrap
                lineHeight: 1.3
            }
        }

        // Bottom section: action buttons
        Column {
            anchors.bottom: parent.bottom; anchors.bottomMargin: 12
            anchors.left: parent.left; anchors.leftMargin: 10
            anchors.right: parent.right; anchors.rightMargin: 10
            spacing: 6

            Rectangle { width: parent.width; height: 1; color: "#484848" }
            Item { width: 1; height: 2 }

            Button {
                width: parent.width; implicitHeight: 32
                text: viewer.isRejected ? "Unreject" : "Reject"
                highlighted: viewer.isRejected
                ToolTip.visible: hovered; ToolTip.delay: 400
                ToolTip.text: viewer.isRejected
                             ? "Remove the rejected mark from this image."
                             : "Mark this image as rejected.\nUse Finalize to move all marked images."
                onClicked: viewer.requestToggleReject()
            }

            Button {
                width: parent.width; implicitHeight: 32
                text: viewer.rejectedCount > 0
                      ? "Finalize (" + viewer.rejectedCount + ")"
                      : "Finalize"
                enabled: viewer.rejectedCount > 0
                ToolTip.visible: hovered; ToolTip.delay: 400
                ToolTip.text: "Move all " + viewer.rejectedCount +
                              " rejected image(s) to the rejected folder.\nDoes not affect stretch or denoise settings."
                onClicked: { footerError.text = ""; finalizeDialog.open() }
            }

            Button {
                width: parent.width; implicitHeight: 32
                text: "Delete File"
                ToolTip.visible: hovered; ToolTip.delay: 400
                ToolTip.text: "Permanently delete this file from disk.\nA confirmation prompt will appear first."
                onClicked: { footerError.text = ""; deleteDialog.open() }
            }
        }
    }

    // ── Image area ────────────────────────────────────────────────────────────
    Rectangle {
        id: imageArea
        anchors.top: toolbar.bottom; anchors.bottom: footer.top
        anchors.left: sidePanel.right; anchors.right: parent.right
        color: "#111111"
        clip: true

        Flickable {
            id: flickable
            anchors.fill: parent
            clip: true
            contentWidth:  Math.max(width,  imgWrap.width)
            contentHeight: Math.max(height, imgWrap.height)

            Item {
                id: imgWrap
                width:  Math.max(1, imageItem.width)
                height: Math.max(1, imageItem.height)
                x: Math.max(0, (flickable.width  - width)  / 2)
                y: Math.max(0, (flickable.height - height) / 2)

                Image {
                    id: imageItem
                    width:  Math.max(1, sourceSize.width  * viewer.zoomLevel)
                    height: Math.max(1, sourceSize.height * viewer.zoomLevel)
                    fillMode: Image.Stretch
                    smooth: viewer.zoomLevel < 1.5
                    asynchronous: true
                    cache: false
                    source: viewer.filePath !== ""
                            ? "image://fitsprovider/" + encodeURIComponent(viewer.filePath)
                              + "?a=" + viewer.stretchA.toFixed(3)
                              + "&p=" + viewer.stretchP.toFixed(2)
                              + "&d=" + viewer.denoiseRadius
                            : ""

                    onStatusChanged: {
                        if (status === Image.Ready) viewer.fitImage()
                    }
                }

                // Red X rejection overlay
                Canvas {
                    id: rejectOverlay
                    anchors.fill: imageItem
                    visible: viewer.isRejected
                    onVisibleChanged: if (visible) requestPaint()
                    onWidthChanged:  requestPaint()
                    onHeightChanged: requestPaint()
                    onPaint: {
                        var ctx = getContext("2d")
                        ctx.clearRect(0, 0, width, height)
                        var lw = Math.max(6, Math.min(width, height) * 0.045)
                        var m  = lw
                        ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.lineWidth = lw + 5; ctx.lineCap = "round"
                        ctx.beginPath(); ctx.moveTo(m, m);         ctx.lineTo(width - m, height - m); ctx.stroke()
                        ctx.beginPath(); ctx.moveTo(width - m, m); ctx.lineTo(m, height - m);         ctx.stroke()
                        ctx.strokeStyle = "#ee2020"; ctx.lineWidth = lw
                        ctx.beginPath(); ctx.moveTo(m, m);         ctx.lineTo(width - m, height - m); ctx.stroke()
                        ctx.beginPath(); ctx.moveTo(width - m, m); ctx.lineTo(m, height - m);         ctx.stroke()
                    }
                }

                BusyIndicator {
                    anchors.centerIn: parent
                    width: 56; height: 56
                    running: imageItem.status === Image.Loading
                }

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

    // ── Footer (path + error) ─────────────────────────────────────────────────
    Rectangle {
        id: footer
        anchors.bottom: parent.bottom; anchors.left: parent.left; anchors.right: parent.right
        height: 36
        color: "#2b2b2b"

        Column {
            anchors.verticalCenter: parent.verticalCenter
            anchors.left: parent.left; anchors.leftMargin: 12
            anchors.right: parent.right; anchors.rightMargin: 12
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
                id: footerError
                text: ""; visible: text !== ""
                color: "#cc4444"; font.pixelSize: 11
                width: parent.width; elide: Text.ElideRight
            }
        }
    }

    // ── Finalize confirmation dialog ──────────────────────────────────────────
    Dialog {
        id: finalizeDialog
        parent: Overlay.overlay
        anchors.centerIn: parent
        modal: true
        title: "Finalize Rejected Images"
        standardButtons: Dialog.Ok | Dialog.Cancel

        Column {
            spacing: 10; width: 420

            Text {
                width: parent.width
                text: "Move " + viewer.rejectedCount + " rejected image" +
                      (viewer.rejectedCount !== 1 ? "s" : "") +
                      " to the rejected folder?"
                color: "#dddddd"; font.pixelSize: 13; wrapMode: Text.WordWrap
            }
            Text {
                width: parent.width
                text: "Each file will be placed in a rejected/ subfolder beside its current folder."
                color: "#888888"; font.pixelSize: 11; wrapMode: Text.WordWrap
            }
        }

        onAccepted: viewer.finalizeAccepted()
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
                footerError.text = "Could not delete file — check permissions."
            }
        }
    }
}
