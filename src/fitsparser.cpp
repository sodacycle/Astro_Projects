#include "fitsparser.h"
#include <QFile>
#include <QTextStream>

QHash<QString, QVariant> FitsParser::parseHeader(const QString &filePath)
{
    // - Read the FITS header blocks until the END keyword is found -
    QFile file(filePath);
    if (!file.open(QIODevice::ReadOnly))
        return {};

    constexpr qint64 blockSize = 2880;
    QByteArray headerData;
    qint64 offset = 0;

    while (true) {
        QByteArray block = file.read(blockSize);
        if (block.isEmpty()) break;
        headerData.append(block);
        offset += block.size();
        if (headerData.contains("END")) break;
    }

    file.close();

    QHash<QString, QVariant> header;
    // - Parse each 80-byte FITS card into a key/value pair -
    for (int i = 0; i < headerData.size(); i += 80) {
        QByteArray card = headerData.mid(i, 80);
        if (card.trimmed().isEmpty()) continue;

        QString key = QString::fromLatin1(card.left(8)).trimmed();
        if (key == "END") break;
        if (key.isEmpty()) continue;

        QString rest = QString::fromLatin1(card.mid(8)).trimmed();

        if (rest.startsWith('=')) {
            QString valuePart = rest.mid(1);
            int commentIndex = valuePart.indexOf('/');
            if (commentIndex != -1)
                valuePart = valuePart.left(commentIndex);
            valuePart = valuePart.trimmed();

            QVariant value;
            if (valuePart.startsWith("'") && valuePart.endsWith("'")) {
                value = valuePart.mid(1, valuePart.length() - 2);
            } else if (valuePart == "T") {
                value = true;
            } else if (valuePart == "F") {
                value = false;
            } else {
                bool ok;
                if (valuePart.contains('.')) {
                    double d = valuePart.toDouble(&ok);
                    if (ok) value = d;
                } else {
                    int n = valuePart.toInt(&ok);
                    if (ok) value = n;
                }
                if (!ok && !valuePart.isEmpty())
                    value = valuePart;
            }

            if (value.isValid())
                header[key] = value;
        }
    }

    return header;
}
