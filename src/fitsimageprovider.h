#ifndef FITSIMAGEPROVIDER_H
#define FITSIMAGEPROVIDER_H

#include <QQuickImageProvider>
#include <QImage>

// Reads a FITS file path (URL-encoded as the id) and returns a contrast-stretched
// QImage suitable for display. Supports BITPIX 8/16/32/-32/-64, mono and 3-plane RGB.
class FitsImageProvider : public QQuickImageProvider
{
public:
    FitsImageProvider();
    QImage requestImage(const QString &id, QSize *size, const QSize &requestedSize) override;
};

#endif // FITSIMAGEPROVIDER_H
