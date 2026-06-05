import QtQuick
import QtQuick.Controls

Rectangle {
    id: root
    height: col.height + 32
    color:        window.sysPal.base
    border.color: window.sysPal.mid
    border.width: 1
    radius: 6

    property int rowCount: 0
    signal catalogSelected(string catalogName)

    Connections {
        target: catalogModel
        function onModelReset()   { root.rowCount = catalogModel.rowCount() }
        function onRowsInserted() { root.rowCount = catalogModel.rowCount() }
        function onRowsRemoved()  { root.rowCount = catalogModel.rowCount() }
    }

    Column {
        id: col
        anchors.top:     parent.top
        anchors.left:    parent.left
        anchors.right:   parent.right
        anchors.margins: 16
        spacing: 10

        Text {
            text: "Catalog Breakdown"
            font.pixelSize: 20; font.bold: true
            color: window.sysPal.windowText; width: parent.width
        }
        Flow {
            width: parent.width; spacing: 8
            visible: root.rowCount > 0
            Repeater {
                model: catalogModel
                delegate: Rectangle {
                    required property var model
                    width: 160; height: 36; radius: 6
                    color: ma.containsMouse ? window.sysPal.highlight : window.sysPal.alternateBase
                    border.color: ma.containsMouse ? window.sysPal.highlight : window.sysPal.mid
                    border.width: 1
                    Row {
                        anchors.verticalCenter: parent.verticalCenter
                        anchors.left:   parent.left
                        anchors.right:  parent.right
                        anchors.margins: 8
                        spacing: 4
                        Text {
                            text: model.catalogName || ""
                            color: ma.containsMouse ? window.sysPal.highlightedText : window.sysPal.windowText
                            font.pixelSize: 13
                            width: parent.width - 36
                            elide: Text.ElideRight
                            anchors.verticalCenter: parent.verticalCenter
                        }
                        Rectangle {
                            width: 28; height: 20; radius: 10
                            color: window.sysPal.highlight
                            anchors.verticalCenter: parent.verticalCenter
                            Text {
                                anchors.centerIn: parent
                                text: model.catalogCount || "0"
                                color: window.sysPal.highlightedText
                                font.pixelSize: 11; font.bold: true
                            }
                        }
                    }
                    MouseArea {
                        id: ma; anchors.fill: parent
                        hoverEnabled: true; cursorShape: Qt.PointingHandCursor
                        onClicked: root.catalogSelected(model.catalogName)
                    }
                }
            }
        }
        Text {
            text: "Scan FITS files to see catalog breakdown."
            color: window.sysPal.placeholderText; font.pixelSize: 13
            visible: root.rowCount === 0; width: parent.width
        }
        Item { width: 1; height: 4 }
    }
}
