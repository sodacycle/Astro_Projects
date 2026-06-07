import QtQuick
import QtQuick.Controls

Rectangle {
    id: root
    height: col.height + 32
    color:        window.sysPal.base
    border.color: window.sysPal.mid
    border.width: 1
    radius: 6

    property int currentYear:  new Date().getFullYear()
    property int currentMonth: new Date().getMonth()
    property var monthNames: ["January","February","March","April","May","June",
                              "July","August","September","October","November","December"]
    property var dayNames: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
    property var calendarDays: []
    property string activeCatalogFilter: ""
    property string activeTargetFilter: ""

    property real cellW: Math.max(1, (width - 32 - 12) / 7)
    property int  gridRows: calendarDays.length > 0 ? Math.ceil(calendarDays.length / 7) : 0
    property real gridH:    gridRows * 80 + Math.max(0, gridRows - 1) * 2

    function matchesCatalog(targetName, catalog) {
        if (catalog === "") return true
        var t = targetName.toUpperCase().replace(/MOSAIC/g,"").replace(/PANEL/g,"").replace(/-/g," ").trim()
        if (catalog === "Messier")   return t.startsWith("M ")
        if (catalog === "NGC")       return t.startsWith("NGC")
        if (catalog === "IC")        return t.startsWith("IC")
        if (catalog === "Caldwell")  return t.startsWith("CALDWELL")
        if (catalog === "Sharpless") return t.startsWith("SH2") || t.startsWith("SH ")
        if (catalog === "Barnard")   return t.startsWith("BARNARD") || t.startsWith("B ")
        if (catalog === "LDN")       return t.startsWith("LDN")
        if (catalog === "LBN")       return t.startsWith("LBN")
        if (catalog === "Abell")     return t.startsWith("ABELL")
        if (catalog === "PGC")       return t.startsWith("PGC")
        if (catalog === "UGC")       return t.startsWith("UGC")
        if (catalog === "Other")     return !t.startsWith("M ") && !t.startsWith("NGC") &&
            !t.startsWith("IC") && !t.startsWith("CALDWELL") && !t.startsWith("SH") &&
            !t.startsWith("BARNARD") && !t.startsWith("B ") && !t.startsWith("LDN") &&
            !t.startsWith("LBN") && !t.startsWith("ABELL") && !t.startsWith("PGC") &&
            !t.startsWith("UGC")
        return true
    }

    function buildCalendar(metadataList) {
        if (!metadataList || metadataList.length === 0) { calendarDays = []; return }
        var sbd = {}
        for (var i = 0; i < metadataList.length; i++) {
            var it = metadataList[i]
            var dp = it["Start Time UTC"] ? it["Start Time UTC"].toString().split(" ")[0] : ""
            var tg = it["Target"]
            var ex = parseFloat(it["Total Exposure Time s"] || 0)
            if (dp && tg && ex > 0 && matchesCatalog(tg, activeCatalogFilter)
                    && (activeTargetFilter === "" || tg === activeTargetFilter)) {
                if (!sbd[dp]) sbd[dp] = {}
                sbd[dp][tg] = (sbd[dp][tg] || 0) + ex
            }
        }
        var fd  = new Date(currentYear, currentMonth, 1).getDay()
        var dm  = new Date(currentYear, currentMonth + 1, 0).getDate()
        var dp2 = new Date(currentYear, currentMonth, 0).getDate()
        var days = []
        for (var p = fd - 1; p >= 0; p--) {
            var pd = dp2 - p
            days.push({ dayNumber: pd,
                moonPhase: weatherService.getMoonPhase(new Date(currentYear, currentMonth-1, pd)),
                isOtherMonth: true, dateStr: "", sessions: {}, weather: null })
        }
        for (var d = 1; d <= dm; d++) {
            var ds = currentYear+"-"+String(currentMonth+1).padStart(2,"0")+"-"+String(d).padStart(2,"0")
            var sessions = sbd[ds] || {}
            var hasSessions = Object.keys(sessions).length > 0
            var wd = hasSessions ? weatherService.weatherForDate(ds) : null
            days.push({ dayNumber: d,
                moonPhase: weatherService.getMoonPhase(new Date(ds)),
                isOtherMonth: false, dateStr: ds, sessions: sessions,
                weather: (wd && wd.valid) ? wd : null })
        }
        var tc = fd + dm, rem = 7 - (tc % 7)
        if (rem < 7) {
            for (var n = 1; n <= rem; n++)
                days.push({ dayNumber: n,
                    moonPhase: weatherService.getMoonPhase(new Date(currentYear, currentMonth+1, n)),
                    isOtherMonth: true, dateStr: "", sessions: {}, weather: null })
        }
        calendarDays = days
    }

    function weatherDetail(wd) {
        if (!wd) return ""
        var emoji = weatherService.getWeatherEmoji(wd.weatherCode, wd.avgCloud)
        var parts = []
        if (wd.nightTemp !== 0) {
            var temp = weatherService.celsius ? Math.round(wd.nightTemp)
                                              : Math.round(wd.nightTemp * 9/5 + 32)
            parts.push("🌡" + temp + "°" + (weatherService.celsius ? "C" : "F"))
        }
        if (wd.avgHumidity > 0) parts.push("💧" + Math.round(wd.avgHumidity) + "%")
        return " |" + emoji + (parts.length > 0 ? " (" + parts.join("|") + ")" : "")
    }

    Column {
        id: col
        anchors.top:     parent.top
        anchors.left:    parent.left
        anchors.right:   parent.right
        anchors.margins: 16
        spacing: 10

        Row {
            width: parent.width; spacing: 8
            Text {
                text: "Imaging Calendar"; font.pixelSize: 20; font.bold: true
                color: window.sysPal.windowText
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - tempBtn.width - 8
            }
            Button {
                id: tempBtn; text: weatherService.celsius ? "°C / °F" : "°F / °C"
                font.pixelSize: 11; implicitWidth: 80; implicitHeight: 28
                anchors.verticalCenter: parent.verticalCenter
                ToolTip.visible: hovered
                ToolTip.delay: 500
                ToolTip.text: "Toggle weather temperature display\nbetween Celsius and Fahrenheit."
                onClicked: weatherService.toggleUnit()
            }
        }
        Row {
            width: parent.width; spacing: 0
            Button {
                text: "<"; implicitWidth: 36; implicitHeight: 28
                ToolTip.visible: hovered
                ToolTip.delay: 500
                ToolTip.text: "Go to the previous month."
                onClicked: {
                    if (--currentMonth < 0) { currentMonth = 11; currentYear-- }
                    weatherService.fetchWeather(currentYear, currentMonth + 1)
                    buildCalendar(window.fullMetadataList)
                }
            }
            Text {
                text: monthNames[currentMonth] + " " + currentYear
                color: window.sysPal.windowText; font.pixelSize: 15; font.bold: true
                width: parent.width - 72
                horizontalAlignment: Text.AlignHCenter
                anchors.verticalCenter: parent.verticalCenter
            }
            Button {
                text: ">"; implicitWidth: 36; implicitHeight: 28
                ToolTip.visible: hovered
                ToolTip.delay: 500
                ToolTip.text: "Go to the next month."
                onClicked: {
                    if (++currentMonth > 11) { currentMonth = 0; currentYear++ }
                    weatherService.fetchWeather(currentYear, currentMonth + 1)
                    buildCalendar(window.fullMetadataList)
                }
            }
        }
        Text {
            text: "Scan FITS files to populate the imaging calendar."
            color: window.sysPal.placeholderText; font.pixelSize: 13
            visible: calendarDays.length === 0; width: parent.width
        }
        Row {
            spacing: 2; visible: calendarDays.length > 0
            Repeater {
                model: dayNames
                Rectangle {
                    width: root.cellW; height: 26
                    color: window.sysPal.alternateBase; radius: 3
                    Text { anchors.centerIn: parent; text: modelData
                        color: window.sysPal.windowText; font.pixelSize: 11; font.bold: true }
                }
            }
        }
        Item {
            width: parent.width; height: root.gridH
            visible: calendarDays.length > 0
            Grid {
                columns: 7; spacing: 2
                Repeater {
                    model: calendarDays
                    delegate: Rectangle {
                        required property var modelData
                        property var dd: modelData
                        property bool hasSessions: Object.keys(dd.sessions).length > 0
                        width: root.cellW; height: 78
                        color: window.sysPal.base
                        border.color: hasSessions ? window.sysPal.highlight : window.sysPal.mid
                        border.width: hasSessions ? 2 : 1
                        radius: 4
                        opacity: dd.isOtherMonth ? 0.4 : 1.0; clip: true
                        Column {
                            anchors.fill: parent; anchors.margins: 4; spacing: 2
                            Text {
                                text: dd.dayNumber + "  " + dd.moonPhase +
                                      (hasSessions ? root.weatherDetail(dd.weather) : "")
                                color: window.sysPal.windowText
                                font.pixelSize: 10; font.bold: true
                                width: parent.width; elide: Text.ElideRight
                            }
                            Repeater {
                                model: Object.keys(dd.sessions).slice(0, 2)
                                delegate: Rectangle {
                                    required property string modelData
                                    property string tgt: modelData
                                    width: parent.width; height: 17
                                    color: window.sysPal.highlight; radius: 3
                                    Text {
                                        anchors.fill: parent; anchors.margins: 2
                                        text: tgt + " – " + Math.round(dd.sessions[tgt]/60) + "m"
                                        color: window.sysPal.highlightedText
                                        font.pixelSize: 9; elide: Text.ElideRight
                                        verticalAlignment: Text.AlignVCenter
                                    }
                                    MouseArea {
                                        anchors.fill: parent; cursorShape: Qt.PointingHandCursor
                                        onClicked: fileDetailsView.filterByTargetAndDate(tgt, dd.dateStr)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Item { width: 1; height: 4 }
    }
    Connections {
        target: weatherService
        function onWeatherUpdated() { buildCalendar(window.fullMetadataList) }
        function onUnitChanged()    { buildCalendar(window.fullMetadataList) }
    }
}
