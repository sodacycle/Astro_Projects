#include "metadatamodel.h"
#include <QSet>

// - Implementation of models that expose metadata, targets, calibrations, and catalog data to QML -

// ---- MetadataTableModel ----

MetadataTableModel::MetadataTableModel(QObject *parent) : QAbstractListModel(parent) {}

int MetadataTableModel::rowCount(const QModelIndex &parent) const
{
    if (parent.isValid()) return 0;
    return m_rows.size();
}

QHash<int, QByteArray> MetadataTableModel::roleNames() const
{
    return {
        {ValueRole, "value"},
        {ColumnNameRole, "columnName"}
    };
}

QVariant MetadataTableModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() >= m_rows.size())
        return {};

    if (role == ColumnNameRole)
        return m_columns.value(index.column());

    const auto &row = m_rows[index.row()];
    if (role == ValueRole || role == Qt::DisplayRole) {
        QString col = m_columns.value(index.column());
        return row.value(col);
    }

    return {};
}

void MetadataTableModel::setData(const QVariantList &rows, const QStringList &columns)
{
    beginResetModel();
    m_rows.clear();
    m_columns = columns;
    for (const auto &r : rows)
        m_rows.append(r.toMap());
    endResetModel();
}

void MetadataTableModel::clear()
{
    beginResetModel();
    m_rows.clear();
    m_columns.clear();
    endResetModel();
}

void MetadataTableModel::filterByCatalog(const QString &catalog,
                                          const QVariantList &allRows,
                                          const QStringList &columns)
{
    // - Keep only rows whose target matches the selected catalog group -
    beginResetModel();
    m_columns = columns;
    m_rows.clear();

    auto matchesCatalog = [&](const QString &target) -> bool {
        QString name = target.toUpper().trimmed();
        name.remove("MOSAIC").remove("PANEL").replace("-", " ");
        name = name.simplified();

        auto starts = [&](const QString &prefix) { return name.startsWith(prefix); };

        if (catalog == "Messier") return starts("M ");
        if (catalog == "NGC") return starts("NGC");
        if (catalog == "IC") return starts("IC");
        if (catalog == "Caldwell") return starts("CALDWELL");
        if (catalog == "Sharpless") return starts("SH") || starts("SH2");
        if (catalog == "Barnard") return starts("BARNARD") || starts("B ");
        if (catalog == "LDN") return starts("LDN");
        if (catalog == "LBN") return starts("LBN");
        if (catalog == "Abell") return starts("ABELL");
        if (catalog == "PGC") return starts("PGC");
        if (catalog == "UGC") return starts("UGC");
        if (catalog == "Other") {
            return !starts("M ") && !starts("NGC") && !starts("IC") &&
                   !starts("CALDWELL") && !starts("SH") && !starts("SH2") &&
                   !starts("BARNARD") && !starts("B ") && !starts("LDN") &&
                   !starts("LBN") && !starts("ABELL") && !starts("PGC") && !starts("UGC");
        }
        return false;
    };

    for (const auto &r : allRows) {
        QVariantMap row = r.toMap();
        if (matchesCatalog(row.value("Target").toString()))
            m_rows.append(row);
    }
    endResetModel();
}

void MetadataTableModel::filterByTargetAndDate(const QString &target,
                                                const QString &date,
                                                const QVariantList &allRows,
                                                const QStringList &columns)
{
    // - Filter metadata by a selected target and observation date -
    beginResetModel();
    m_columns = columns;
    m_rows.clear();

    for (const auto &r : allRows) {
        QVariantMap row = r.toMap();
        QString startTime = row.value("Start Time UTC").toString();
        QString itemDate = startTime.left(10);
        if (row.value("Target").toString() == target && itemDate == date)
            m_rows.append(row);
    }
    endResetModel();
}

// ---- TargetSummaryModel ----
// - Exposes summary rows for each observed target to the UI -

TargetSummaryModel::TargetSummaryModel(QObject *parent) : QAbstractListModel(parent) {}

int TargetSummaryModel::rowCount(const QModelIndex &parent) const
{
    if (parent.isValid()) return 0;
    return m_entries.size();
}

QHash<int, QByteArray> TargetSummaryModel::roleNames() const
{
    return {
        {TargetRole, "targetName"},
        {FitsCountRole, "fitsCount"},
        {FilesWithExposureRole, "filesWithExposure"},
        {IntegrationTimeRole, "integrationTime"}
    };
}

QVariant TargetSummaryModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() >= m_entries.size()) return {};
    const auto &e = m_entries[index.row()];
    switch (role) {
    case TargetRole: return e.value("Target");
    case FitsCountRole: return e.value("FITS Count");
    case FilesWithExposureRole: return e.value("Files With Exposure");
    case IntegrationTimeRole: return e.value("Total Integration Time");
    default: return {};
    }
}

void TargetSummaryModel::setEntries(const QVariantList &entries)
{
    beginResetModel();
    m_entries.clear();
    for (const auto &e : entries)
        m_entries.append(e.toMap());
    endResetModel();
}

// ---- CalibrationSummaryModel ----
// - Exposes calibration frame statistics grouped by type and settings -

CalibrationSummaryModel::CalibrationSummaryModel(QObject *parent) : QAbstractListModel(parent) {}

int CalibrationSummaryModel::rowCount(const QModelIndex &parent) const
{
    if (parent.isValid()) return 0;
    return m_entries.size();
}

QHash<int, QByteArray> CalibrationSummaryModel::roleNames() const
{
    return {
        {FrameTypeRole, "frameType"},
        {ExposureTimeRole, "exposureTime"},
        {GainRole, "gain"},
        {BinningRole, "binning"},
        {SensorTempRole, "sensorTemp"},
        {CountRole, "count"},
        {MostRecentRole, "mostRecent"}
    };
}

QVariant CalibrationSummaryModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() >= m_entries.size()) return {};
    const auto &e = m_entries[index.row()];
    switch (role) {
    case FrameTypeRole: return e.value("Frame Type");
    case ExposureTimeRole: return e.value("Exposure Time s");
    case GainRole: return e.value("Gain");
    case BinningRole: return e.value("Binning");
    case SensorTempRole: return e.value("Sensor Temp C");
    case CountRole: return e.value("Count");
    case MostRecentRole: return e.value("Most Recent");
    default: return {};
    }
}

void CalibrationSummaryModel::setEntries(const QVariantList &entries)
{
    beginResetModel();
    m_entries.clear();
    for (const auto &e : entries)
        m_entries.append(e.toMap());
    endResetModel();
}

// ---- CatalogModel ----
// - Builds the catalog count view used in the target/catalog breakdown panel -

CatalogModel::CatalogModel(QObject *parent) : QAbstractListModel(parent) {}

int CatalogModel::rowCount(const QModelIndex &parent) const
{
    if (parent.isValid()) return 0;
    return m_catalogs.size();
}

QHash<int, QByteArray> CatalogModel::roleNames() const
{
    return {
        {CatalogNameRole, "catalogName"},
        {CatalogCountRole, "catalogCount"}
    };
}

QVariant CatalogModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() >= m_catalogs.size()) return {};
    const auto &c = m_catalogs[index.row()];
    switch (role) {
    case CatalogNameRole: return c.name;
    case CatalogCountRole: return c.count;
    default: return {};
    }
}

void CatalogModel::clear()
{
    beginResetModel();
    m_catalogs.clear();
    endResetModel();
}

void CatalogModel::buildFromTargets(const QVariantList &targetSummary)
{
    beginResetModel();
    m_catalogs.clear();

    QMap<QString, int> counts = {
        {"Messier", 0}, {"NGC", 0}, {"IC", 0}, {"Caldwell", 0},
        {"Sharpless", 0}, {"Barnard", 0}, {"LDN", 0}, {"LBN", 0},
        {"Abell", 0}, {"PGC", 0}, {"UGC", 0}, {"Other", 0}
    };

    auto classify = [](const QString &name) -> QString {
        QString n = name.toUpper().trimmed();
        n.remove("MOSAIC").remove("PANEL").replace("-", " ");
        n = n.simplified();
        if (n.startsWith("M ")) return "Messier";
        if (n.startsWith("NGC")) return "NGC";
        if (n.startsWith("IC")) return "IC";
        if (n.startsWith("CALDWELL")) return "Caldwell";
        if (n.startsWith("SH2") || n.startsWith("SH ")) return "Sharpless";
        if (n.startsWith("BARNARD") || n.startsWith("B ")) return "Barnard";
        if (n.startsWith("LDN")) return "LDN";
        if (n.startsWith("LBN")) return "LBN";
        if (n.startsWith("ABELL")) return "Abell";
        if (n.startsWith("PGC")) return "PGC";
        if (n.startsWith("UGC")) return "UGC";
        return "Other";
    };

    for (const auto &entry : targetSummary) {
        QVariantMap map = entry.toMap();
        QString target = map.value("Target").toString();
        QString cat = classify(target);
        counts[cat]++;
    }

    for (auto it = counts.begin(); it != counts.end(); ++it)
        m_catalogs.append({it.key(), it.value()});

    endResetModel();
}
