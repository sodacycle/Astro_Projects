cmake_minimum_required(VERSION 3.16)
project(FITSMetadataViewer VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Widgets Quick QuickControls2 Network Concurrent)

# WIN32 prevents a console window appearing behind the app on Windows.
# On Linux/macOS this flag is ignored.
qt_add_executable(AstroDataViewer WIN32
    src/main.cpp
    src/fitsparser.h       src/fitsparser.cpp
    src/fitsscanner.h      src/fitsscanner.cpp
    src/fileorganizer.h    src/fileorganizer.cpp
    src/fitsimageprovider.h src/fitsimageprovider.cpp
    src/weatherservice.h   src/weatherservice.cpp
    src/metadatamodel.h    src/metadatamodel.cpp
)

qt_add_qml_module(AstroDataViewer
    URI FITSMetadataViewer
    VERSION 1.0
    QML_FILES
        qml/main.qml
        qml/ControlsPanel.qml
        qml/AdvancedToolsPanel.qml
        qml/TargetSummaryView.qml
        qml/CatalogBreakdown.qml
        qml/ImagingCalendar.qml
        qml/CalibrationSummaryView.qml
        qml/FileDetailsView.qml
        qml/FitsImageViewer.qml
        qml/FitsViewerManager.qml
        qml/AboutDialog.qml
        qml/components/ProgressIndicator.qml
)

target_link_libraries(AstroDataViewer PRIVATE
    Qt6::Core
    Qt6::Widgets
    Qt6::Quick
    Qt6::QuickControls2
    Qt6::Network
    Qt6::Concurrent
)

install(TARGETS AstroDataViewer
    BUNDLE  DESTINATION .
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)
