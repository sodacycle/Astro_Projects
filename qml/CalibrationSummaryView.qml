import QtQuick
import QtQuick.Controls

Rectangle {
    id: root
    height: rowCount > 0 ? col.height + 32 : 0
    visible: rowCount > 0
    color:        window.sysPal.base
    border.color: window.sysPal.mid
    border.width: 1
    radius: 6

    property int rowCount: 0
    property var colW: [110, 130, 80, 80, 130, 60, 200]
    property var colL: ["Frame Type","Exposure Time s","Gain","Binning",
                        "Sensor Temp C","Count","Most Recent"]

    Connections {
        target: calibrationSummaryModel
        function onModelReset()   { root.rowCount = calibrationSummaryModel.rowCount() }
        function onRowsInserted() { root.rowCount = calibrationSummaryModel.rowCount() }
        function onRowsRemoved()  { root.rowCount = calibrationSummaryModel.rowCount() }
    }

    Column {
        id: col
        anchors.top:     parent.top
        anchors.left:    parent.left
        anchors.right:   parent.right
        anchors.margins: 16
        spacing: 10

        Text {
            text: "Calibration Frames"
            font.pixelSize: 20; font.bold: true
            color: window.sysPal.windowText; width: parent.width
        }
        Row {
            spacing: 0; visible: root.rowCount > 0
            Repeater {
                model: root.colL
                Rectangle {
                    width: root.colW[index]; height: 32
                    color: window.sysPal.alternateBase
                    Text {
                        anchors.fill: parent; anchors.leftMargin: 8
                        text: modelData; color: window.sysPal.windowText
                        font.pixelSize: 12; font.bold: true
                        verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight
                    }
                }
            }
        }
        Item {
            width: parent.width
            height: root.rowCount > 0 ? Math.min(300, root.rowCount * 36 + 2) : 0
            visible: root.rowCount > 0

        ListView {
            id: calList
            anchors.fill: parent
            clip: true
            model: calibrationSummaryModel
            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
            delegate: Rectangle {
                required property int    index
                required property string frameType
                required property var    exposureTime
                required property string gain
                required property string binning
                required property string sensorTemp
                required property var    count
                required property string mostRecent

                width: ListView.view.width; height: 36
                color: index % 2 === 0 ? window.sysPal.alternateBase : "transparent"

                Row {
                    anchors.fill: parent

                    Rectangle {
                        width: root.colW[0]; height: 36; color: "transparent"
                        Text {
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 4
                            text: frameType
                            color: frameType === "DARK" ? "#6ea8fe"
                                 : frameType === "FLAT" ? "#a3cfbb"
                                 : frameType === "BIAS" ? "#e2a069"
                                 : window.sysPal.windowText
                            font.pixelSize: 13; font.bold: true
                            verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight
                        }
                    }
                    Rectangle {
                        width: root.colW[1]; height: 36; color: "transparent"
                        Text {
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 4
                            text: exposureTime !== undefined ? Number(exposureTime).toFixed(1) + "s" : ""
                            color: window.sysPal.windowText; font.pixelSize: 13
                            verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight
                        }
                    }
                    Rectangle {
                        width: root.colW[2]; height: 36; color: "transparent"
                        Text {
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 4
                            text: gain; color: window.sysPal.windowText; font.pixelSize: 13
                            verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight
                        }
                    }
                    Rectangle {
                        width: root.colW[3]; height: 36; color: "transparent"
                        Text {
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 4
                            text: binning; color: window.sysPal.windowText; font.pixelSize: 13
                            verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight
                        }
                    }
                    Rectangle {
                        width: root.colW[4]; height: 36; color: "transparent"
                        Text {
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 4
                            text: sensorTemp; color: window.sysPal.windowText; font.pixelSize: 13
                            verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight
                        }
                    }
                    Rectangle {
                        width: root.colW[5]; height: 36; color: "transparent"
                        Text {
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 4
                            text: count !== undefined ? count : ""
                            color: window.sysPal.windowText; font.pixelSize: 13
                            verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight
                        }
                    }
                    Rectangle {
                        width: root.colW[6]; height: 36; color: "transparent"
                        Text {
                            anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 4
                            text: mostRecent; color: window.sysPal.windowText; font.pixelSize: 13
                            verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight
                        }
                    }
                }
            }
        }
        } // Item (scroll wrapper)
        Item { width: 1; height: 4 }
    }
}
