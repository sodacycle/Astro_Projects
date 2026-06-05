#ifndef FITSPARSER_H
#define FITSPARSER_H

#include <QString>
#include <QHash>
#include <QVariant>

struct FitsCard {
    QString key;
    QVariant value;
};

// - Simple parser class for extracting FITS header key/value pairs from a file -
class FitsParser
{
public:
    static QHash<QString, QVariant> parseHeader(const QString &filePath);
};

#endif // FITSPARSER_H
