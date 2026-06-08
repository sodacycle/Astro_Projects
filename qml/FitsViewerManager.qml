import QtQuick
import QtQuick.Controls

// Logic-only controller that owns the FITS viewer window and all
// rejection/navigation state.  main.qml binds displayRows and
// transientParent, calls openFile(), and handles removeRowRequested().
Item {
    id: manager
    width: 0; height: 0; visible: false

    // ── Public API ────────────────────────────────────────────────────────────

    // Bind to fileDetailsView.displayRows so navigation always uses the
    // current (possibly filtered) file list.
    property var displayRows: []

    // Forward to the inner Window so it appears as a child of the main window.
    property var transientParent: null

    // Emitted whenever a row must be removed from the file list model.
    // The caller (main.qml) handles the actual removeRow() call.
    signal removeRowRequested(string path)

    // Open the viewer for the given file path.  The path is looked up in
    // displayRows to set fileIndex / fileCount correctly.
    function openFile(path) {
        var rows = manager.displayRows
        var idx  = -1
        for (var i = 0; i < rows.length; i++) {
            if ((rows[i]["Path"] || "") === path) { idx = i; break }
        }
        fitsViewer.fileIndex  = idx
        fitsViewer.fileCount  = rows.length
        fitsViewer.isRejected = !!manager.rejectedSet[path]
        fitsViewer.openFile(path)
    }

    // ── Internal state ────────────────────────────────────────────────────────

    // Keys are file paths; a key's presence means the file is marked rejected
    // for this session.  Files are not moved until Finalize is confirmed.
    property var rejectedSet: ({})

    // ── Viewer window ─────────────────────────────────────────────────────────
    FitsImageViewer {
        id: fitsViewer
        transientParent: manager.transientParent

        // File was deleted — viewer hides itself; we just clean up the lists.
        onFileDeleted: function(path) {
            delete manager.rejectedSet[path]
            fitsViewer.rejectedCount = Object.keys(manager.rejectedSet).length
            manager.removeRowRequested(path)
        }

        // Toggle the rejected mark for the currently displayed image.
        onRequestToggleReject: {
            var path = fitsViewer.filePath
            if (manager.rejectedSet[path]) {
                delete manager.rejectedSet[path]
                fitsViewer.isRejected = false
            } else {
                manager.rejectedSet[path] = true
                fitsViewer.isRejected = true
            }
            fitsViewer.rejectedCount = Object.keys(manager.rejectedSet).length
        }

        // Move all session-marked images then navigate to the next valid file.
        onFinalizeAccepted: {
            var paths = Object.keys(manager.rejectedSet)
            for (var i = 0; i < paths.length; i++) {
                var newPath = organizer.rejectFile(paths[i])
                if (newPath !== "")
                    manager.removeRowRequested(paths[i])
            }
            manager.rejectedSet      = {}
            fitsViewer.rejectedCount = 0
            fitsViewer.isRejected    = false

            var rows = manager.displayRows
            fitsViewer.fileCount = rows.length
            var idx = Math.min(fitsViewer.fileIndex, rows.length - 1)
            if (idx >= 0 && idx < rows.length) {
                fitsViewer.fileIndex = idx
                fitsViewer.openFile(rows[idx]["Path"] || "")
            } else {
                fitsViewer.visible = false
            }
        }

        onRequestPrevious: {
            var idx  = fitsViewer.fileIndex - 1
            var rows = manager.displayRows
            if (idx >= 0 && idx < rows.length) {
                var p = rows[idx]["Path"] || ""
                fitsViewer.fileIndex  = idx
                fitsViewer.isRejected = !!manager.rejectedSet[p]
                fitsViewer.openFile(p)
            }
        }

        onRequestNext: {
            var idx  = fitsViewer.fileIndex + 1
            var rows = manager.displayRows
            if (idx >= 0 && idx < rows.length) {
                var p = rows[idx]["Path"] || ""
                fitsViewer.fileIndex  = idx
                fitsViewer.isRejected = !!manager.rejectedSet[p]
                fitsViewer.openFile(p)
            }
        }
    }
}
