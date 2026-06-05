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
        ListView {
            width: parent.width
            height: root.rowCount > 0 ? Math.min(200, root.rowCount * 36) : 0
            visible: root.rowCount > 0
            clip: true; model: calibrationSummaryModel
            interactive: false
            delegate: Rectangle {
                width: parent.width; height: 36
                color: index % 2 === 0 ? window.sysPal.alternateBase : "transparent"
                Row {
                    anchors.fill: parent
                    Repeater {
                        model: [
                            model.frameType,
                            model.exposureTime !== undefined ? Number(model.exposureTime).toFixed(1)+"s" : "",
                            model.gain, model.binning, model.sensorTemp,
                            model.count !== undefined ? model.count : "",
                            model.mostRecent
                        ]
                        Rectangle {
                            width: root.colW[index]; height: 36; color: "transparent"
                            Text {
                                anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 4
                                text: modelData !== undefined ? modelData : ""
                                color: {
                                    if (index === 0) {
                                        var ft = model.frameType || ""
                                        if (ft === "DARK") return "#6ea8fe"
                                        if (ft === "FLAT") return "#a3cfbb"
                                        if (ft === "BIAS") return "#e2a069"
                                    }
                                    return window.sysPal.windowText
                                }
                                font.pixelSize: 13
                                verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight
                            }
                        }
                    }
                }
            }
        }
        Text {
            text: "No calibration frames found."
            color: window.sysPal.placeholderText; font.pixelSize: 13
            visible: root.rowCount === 0; width: parent.width
        }
        Item { width: 1; height: 4 }
    }
}
