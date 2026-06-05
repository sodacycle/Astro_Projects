import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: root
    height: 32
    color: Qt.rgba(26/255, 58/255, 92/255, 0.3)

    signal minimizeRequested()
    signal maximizeRequested()
    signal closeRequested()

    // Drag handle — pressing anywhere on the bar starts a native window move.
    // The button MouseAreas have z:1 so they intercept their own clicks first.
    MouseArea {
        anchors.fill: parent
        onPressed: window.startSystemMove()
    }

    RowLayout {
        anchors.fill: parent
        spacing: 0

        Text {
            Layout.fillWidth: true
            Layout.leftMargin: 12
            text: "FITS Metadata Viewer v1.0 Beta"
            color: "#b2bac2"
            font.pixelSize: 13
            verticalAlignment: Text.AlignVCenter
        }

        Row {
            Layout.alignment: Qt.AlignRight
            height: parent.height

            TitleBarButton {
                btnText:    "─"
                toolTip:    "Minimize"
                onClicked:  root.minimizeRequested()
            }
            TitleBarButton {
                btnText:    window.visibility === Window.Maximized ? "❐" : "□"
                toolTip:    window.visibility === Window.Maximized ? "Restore" : "Maximize"
                onClicked:  root.maximizeRequested()
            }
            TitleBarButton {
                btnText:    "✕"
                toolTip:    "Close"
                hoverColor: "#e81123"
                onClicked:  root.closeRequested()
            }
        }
    }

    // ── Window control button ─────────────────────────────────────────────────
    component TitleBarButton : Rectangle {
        id: btn
        width: 46
        height: 32
        z: 1   // above the drag MouseArea
        color: btnMouse.containsMouse ? hoverColor : "transparent"

        property string btnText:    ""
        property string toolTip:    ""
        property color  hoverColor: Qt.rgba(1, 1, 1, 0.1)

        signal clicked()

        Text {
            anchors.centerIn: parent
            text:  btn.btnText
            color: "white"
            font.pixelSize: 14
        }

        ToolTip.visible:  btnMouse.containsMouse && btn.toolTip !== ""
        ToolTip.text:     btn.toolTip
        ToolTip.delay:    600

        MouseArea {
            id: btnMouse
            anchors.fill: parent
            hoverEnabled: true
            onClicked: btn.clicked()
        }
    }
}
