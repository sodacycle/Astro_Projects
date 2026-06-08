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
        // Grid replaces Flow so every row contains the same number of chips
        // (no ragged last-item wrapping).  Column count auto-adapts to the
        // available width; chips stretch to fill the row exactly.
        Grid {
            id: catalogGrid
            width: parent.width
            visible: root.rowCount > 0
            // Minimum chip width before adding another column
            readonly property int minChipW: 100
            readonly property int gap: 8
            columns: Math.max(1, Math.floor((width + gap) / (minChipW + gap)))
            columnSpacing: gap
            rowSpacing:    gap

            Repeater {
                model: catalogModel
                delegate: Rectangle {
                    required property var model
                    // Fill the row: divide available width equally after spacing
                    width:  Math.floor((catalogGrid.width
                                        - (catalogGrid.columns - 1) * catalogGrid.gap)
                                       / catalogGrid.columns)
                    height: 36; radius: 6
                    color: ma.containsMouse ? window.sysPal.highlight : window.sysPal.alternateBase
                    border.color: ma.containsMouse ? window.sysPal.highlight : window.sysPal.mid
                    border.width: 1
                    Row {
                        anchors.verticalCenter: parent.verticalCenter
                        anchors.left:    parent.left
                        anchors.right:   parent.right
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
