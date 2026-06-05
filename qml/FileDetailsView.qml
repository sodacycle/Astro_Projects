import QtQuick
import QtQuick.Controls

Rectangle {
    id: root
    color:        window.sysPal.base
    border.color: window.sysPal.mid
    border.width: 1
    radius: 6

    property int rowCount: 0
    property var allRows: []
    property var displayRows: []
    signal showAllRequested()

    property var allColumns: [
        "Frame Type","File","Target","Start Time UTC","End Time UTC",
        "Exposure Time s","Number of Subs","Total Exposure Time s",
        "Telescope","Camera Model","Sensor Temperature C","RA","DEC",
        "Latitude","Longitude","Binning","Filter Used","Gain",
        "Focal Length mm","Aperture mm","Focus Position","Image Type","Stacking Software"
    ]
    property var colW: [100,200,150,180,180,110,110,140,150,150,130,100,100,100,100,80,120,80,120,100,120,100,150]
    property int totalW: { var w=0; for(var i=0;i<colW.length;i++) w+=colW[i]; return w }

    onAllRowsChanged: { displayRows = allRows; showAllBtn.visible = false }

    Connections {
        target: metadataModel
        function onModelReset()   { root.rowCount = metadataModel.rowCount() }
        function onRowsInserted() { root.rowCount = metadataModel.rowCount() }
        function onRowsRemoved()  { root.rowCount = metadataModel.rowCount() }
    }

    function filterByCatalog(catalog) {
        if (!allRows.length) return
        var filtered = []
        for (var i = 0; i < allRows.length; i++) {
            var row = allRows[i]
            var t = (row["Target"]||"").toUpperCase().replace(/MOSAIC/g,"").replace(/PANEL/g,"").replace(/-/g," ").trim()
            var m = false
            if      (catalog==="Messier")   m=t.startsWith("M ")
            else if (catalog==="NGC")       m=t.startsWith("NGC")
            else if (catalog==="IC")        m=t.startsWith("IC")
            else if (catalog==="Caldwell")  m=t.startsWith("CALDWELL")
            else if (catalog==="Sharpless") m=t.startsWith("SH2")||t.startsWith("SH ")
            else if (catalog==="Barnard")   m=t.startsWith("BARNARD")||t.startsWith("B ")
            else if (catalog==="LDN")       m=t.startsWith("LDN")
            else if (catalog==="LBN")       m=t.startsWith("LBN")
            else if (catalog==="Abell")     m=t.startsWith("ABELL")
            else if (catalog==="PGC")       m=t.startsWith("PGC")
            else if (catalog==="UGC")       m=t.startsWith("UGC")
            else if (catalog==="Other")     m=!t.startsWith("M ")&&!t.startsWith("NGC")&&!t.startsWith("IC")&&
                !t.startsWith("CALDWELL")&&!t.startsWith("SH")&&!t.startsWith("BARNARD")&&
                !t.startsWith("B ")&&!t.startsWith("LDN")&&!t.startsWith("LBN")&&
                !t.startsWith("ABELL")&&!t.startsWith("PGC")&&!t.startsWith("UGC")
            if (m) filtered.push(row)
        }
        displayRows = filtered; showAllBtn.visible = true
    }

    function filterByTargetAndDate(target, date) {
        if (!allRows.length) return
        var filtered = []
        for (var i = 0; i < allRows.length; i++) {
            var row = allRows[i]
            var rowDate = (row["Start Time UTC"]||"").toString().substring(0,10)
            if (row["Target"]===target && rowDate===date) filtered.push(row)
        }
        displayRows = filtered; showAllBtn.visible = true
    }

    function showAll() { displayRows = allRows; showAllBtn.visible = false; showAllRequested() }

    Column {
        anchors.fill: parent; anchors.margins: 16; spacing: 10

        Row {
            width: parent.width; height: 36; spacing: 8
            Text {
                text: "File-Level Details"
                font.pixelSize: 20; font.bold: true
                color: window.sysPal.windowText
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - showAllBtn.width - 8
            }
            Button {
                id: showAllBtn; text: "Show All"; visible: false; flat: true
                anchors.verticalCenter: parent.verticalCenter
                onClicked: root.showAll()
            }
        }

        Item {
            width: parent.width
            height: parent.height - 46

            ScrollBar {
                id: hBar
                anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
                orientation: Qt.Horizontal; policy: ScrollBar.AsNeeded
                size: Math.min(1.0, parent.width / root.totalW)
            }

            Item {
                id: pane
                anchors.left: parent.left; anchors.right: parent.right
                anchors.top: parent.top; anchors.bottom: hBar.top
                clip: true
                property real hOffset: hBar.position * root.totalW

                Row {
                    x: -pane.hOffset; y: 0; spacing: 0; z: 2; height: 32
                    Repeater {
                        model: root.allColumns
                        Rectangle {
                            width: root.colW[index]; height: 32
                            color: window.sysPal.alternateBase
                            Text {
                                anchors.fill: parent; anchors.leftMargin: 6
                                text: modelData; color: window.sysPal.windowText
                                font.pixelSize: 11; font.bold: true
                                verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight
                            }
                        }
                    }
                }

                ListView {
                    anchors { left: parent.left; right: parent.right
                              top: parent.top; topMargin: 32; bottom: parent.bottom }
                    clip: true
                    model: root.displayRows
                    ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                    delegate: Item {
                        required property var modelData
                        required property int index
                        width: listView.width; height: 30

                        id: listView

                        Rectangle {
                            x: -pane.hOffset; width: root.totalW; height: parent.height
                            color: index % 2 === 0 ? window.sysPal.alternateBase : "transparent"
                        }
                        Row {
                            x: -pane.hOffset; y: 0; spacing: 0; height: parent.height
                            Repeater {
                                model: root.allColumns.length
                                Item {
                                    required property int index
                                    property string colKey: root.allColumns[index]
                                    width: root.colW[index]; height: 30
                                    Text {
                                        anchors.fill: parent; anchors.leftMargin: 6; anchors.rightMargin: 4
                                        text: { var v = modelData[colKey]; return v !== undefined && v !== null ? v : "" }
                                        color: window.sysPal.windowText; font.pixelSize: 12
                                        verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Text {
            text: "Scan FITS files to see file-level details."
            color: window.sysPal.placeholderText; font.pixelSize: 13
            visible: root.displayRows.length === 0
        }
    }
}
