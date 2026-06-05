#ifndef METADATAMODEL_H
#define METADATAMODEL_H

#include <QAbstractListModel>
#include <QList>
#include <QVariantMap>

// - List model exposing FITS metadata rows to QML table views -
class MetadataTableModel : public QAbstractListModel
{
    Q_OBJECT
    Q_PROPERTY(int count READ rowCount)

public:
    enum Roles {
        ValueRole = Qt::UserRole + 1,
        ColumnNameRole
    };

    explicit MetadataTableModel(QObject *parent = nullptr);

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    QHash<int, QByteArray> roleNames() const override;
    QVariant data(const QModelIndex &index, int role = Qt::DisplayRole) const override;

    Q_INVOKABLE void setData(const QVariantList &rows, const QStringList &columns);
    Q_INVOKABLE void clear();
    Q_INVOKABLE void filterByCatalog(const QString &catalog, const QVariantList &allRows, const QStringList &columns);
    Q_INVOKABLE void filterByTargetAndDate(const QString &target, const QString &date,
                                           const QVariantList &allRows, const QStringList &columns);

private:
    QList<QVariantMap> m_rows;
    QStringList m_columns;
};

// - Summary model for categorized target statistics in the UI -
class TargetSummaryModel : public QAbstractListModel
{
    Q_OBJECT
    Q_PROPERTY(int count READ rowCount)

public:
    enum Roles {
        TargetRole = Qt::UserRole + 1,
        FitsCountRole,
        FilesWithExposureRole,
        IntegrationTimeRole
    };

    explicit TargetSummaryModel(QObject *parent = nullptr);

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    QHash<int, QByteArray> roleNames() const override;
    QVariant data(const QModelIndex &index, int role = Qt::DisplayRole) const override;

    Q_INVOKABLE void setEntries(const QVariantList &entries);

private:
    QList<QVariantMap> m_entries;
};

// - Model representing calibration frame statistics for display panels -
class CalibrationSummaryModel : public QAbstractListModel
{
    Q_OBJECT
    Q_PROPERTY(int count READ rowCount)

public:
    enum Roles {
        FrameTypeRole = Qt::UserRole + 1,
        ExposureTimeRole,
        GainRole,
        BinningRole,
        SensorTempRole,
        CountRole,
        MostRecentRole
    };

    explicit CalibrationSummaryModel(QObject *parent = nullptr);

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    QHash<int, QByteArray> roleNames() const override;
    QVariant data(const QModelIndex &index, int role = Qt::DisplayRole) const override;

    Q_INVOKABLE void setEntries(const QVariantList &entries);

private:
    QList<QVariantMap> m_entries;
};

// - Model used to aggregate and present catalog counts from target data -
class CatalogModel : public QAbstractListModel
{
    Q_OBJECT
    Q_PROPERTY(int count READ rowCount)

public:
    enum Roles {
        CatalogNameRole = Qt::UserRole + 1,
        CatalogCountRole
    };

    explicit CatalogModel(QObject *parent = nullptr);

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    QHash<int, QByteArray> roleNames() const override;
    QVariant data(const QModelIndex &index, int role = Qt::DisplayRole) const override;

    Q_INVOKABLE void buildFromTargets(const QVariantList &targetSummary);
    Q_INVOKABLE void clear();

private:
    struct CatalogEntry {
        QString name;
        int count = 0;
    };
    QList<CatalogEntry> m_catalogs;
};

#endif // METADATAMODEL_H
