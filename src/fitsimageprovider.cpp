#include "fitsimageprovider.h"
#include <QFile>
#include <QUrl>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <vector>

FitsImageProvider::FitsImageProvider()
    : QQuickImageProvider(QQuickImageProvider::Image)
{}

// ─────────────────────────────────────────────────────────────────────────────
// Stretch pipeline — equivalent to astropy's:
//   PercentileInterval(99.0) + AsinhStretch(a=0.1)
//
// Step 1 – PercentileInterval(99.0):
//   vmin = 0.5th percentile, vmax = 99.5th percentile of the pixel sample.
//   Clips outliers (hot pixels, cosmic rays) without destroying the bulk
//   of the dynamic range.
//
// Step 2 – normalize to [0, 1]:
//   x = clip((pixel − vmin) / (vmax − vmin), 0, 1)
//
// Step 3 – AsinhStretch(a = 0.1):
//   y = arcsinh(x / a) / arcsinh(1 / a)
//     = arcsinh(10·x) / arcsinh(10)
//   Maps [0,1]→[0,1].  The 'a' parameter sets the transition between the
//   linear (noise-suppressed) and logarithmic (faint-detail) regimes:
//   smaller a → more aggressive stretch.  a=0.1 matches astropy's default.
// ─────────────────────────────────────────────────────────────────────────────

// x must already be normalised to [0, 1].
// a controls the knee: smaller a → more aggressive stretch of faint signal.
static inline double asinhStretch(double x, double a)
{
    return std::asinh(x / a) / std::asinh(1.0 / a);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-channel stretch parameters  (vmin / vmax from the percentile interval)
// ─────────────────────────────────────────────────────────────────────────────
struct StretchParams { double vmin, vmax; };

// Compute vmin/vmax from a sorted pixel sample.
// p is the PercentileInterval value (e.g. 99.0 → clips bottom/top 0.5% each).
static StretchParams computeParams(const std::vector<float>& sorted, double p = 99.0)
{
    const int ns = static_cast<int>(sorted.size());
    if (ns == 0) return {0.0, 1.0};

    const double halfTail = (100.0 - p) * 0.005;   // fraction clipped on each side
    const int lo = static_cast<int>((ns - 1) * halfTail);
    const int hi = static_cast<int>((ns - 1) * (1.0 - halfTail));

    const double vmin = sorted[lo];
    const double vmax = sorted[hi];

    if (vmax - vmin < 1e-6) return {vmin, vmin + 1.0};
    return {vmin, vmax};
}

// ─────────────────────────────────────────────────────────────────────────────
// Separable O(W×H) box blur applied to the final QImage.
// Two 1-D sliding-window passes (horizontal then vertical) give a Gaussian-like
// result; the window is (2r+1)² pixels wide.  r=0 is a no-op.
// ─────────────────────────────────────────────────────────────────────────────
static void applyBoxBlur(QImage& img, int r)
{
    if (r <= 0 || img.isNull()) return;
    const int W = img.width(), H = img.height();
    const bool isRGB = (img.format() == QImage::Format_RGB32);

    if (isRGB) {
        // ── Horizontal pass ──────────────────────────────────────────────────
        std::vector<int> rB(W), gB(W), bB(W), rO(W), gO(W), bO(W);
        for (int y = 0; y < H; ++y) {
            QRgb* row = reinterpret_cast<QRgb*>(img.scanLine(y));
            for (int x = 0; x < W; ++x) {
                rB[x] = qRed(row[x]); gB[x] = qGreen(row[x]); bB[x] = qBlue(row[x]);
            }
            int sR = 0, sG = 0, sB = 0;
            for (int k = 0; k <= std::min(r, W-1); ++k) { sR += rB[k]; sG += gB[k]; sB += bB[k]; }
            for (int x = 0; x < W; ++x) {
                const int w = std::min(x+r+1, W) - std::max(0, x-r);
                rO[x] = sR/w; gO[x] = sG/w; bO[x] = sB/w;
                if (x+r+1 < W) { sR += rB[x+r+1]; sG += gB[x+r+1]; sB += bB[x+r+1]; }
                if (x-r   >= 0) { sR -= rB[x-r];   sG -= gB[x-r];   sB -= bB[x-r]; }
            }
            for (int x = 0; x < W; ++x) row[x] = qRgb(rO[x], gO[x], bO[x]);
        }
        // ── Vertical pass ────────────────────────────────────────────────────
        std::vector<int> rC(H), gC(H), bC(H), rCO(H), gCO(H), bCO(H);
        for (int x = 0; x < W; ++x) {
            for (int y = 0; y < H; ++y) {
                const QRgb p = reinterpret_cast<const QRgb*>(img.constScanLine(y))[x];
                rC[y] = qRed(p); gC[y] = qGreen(p); bC[y] = qBlue(p);
            }
            int sR = 0, sG = 0, sB = 0;
            for (int k = 0; k <= std::min(r, H-1); ++k) { sR += rC[k]; sG += gC[k]; sB += bC[k]; }
            for (int y = 0; y < H; ++y) {
                const int w = std::min(y+r+1, H) - std::max(0, y-r);
                rCO[y] = sR/w; gCO[y] = sG/w; bCO[y] = sB/w;
                if (y+r+1 < H) { sR += rC[y+r+1]; sG += gC[y+r+1]; sB += bC[y+r+1]; }
                if (y-r   >= 0) { sR -= rC[y-r];   sG -= gC[y-r];   sB -= bC[y-r]; }
            }
            for (int y = 0; y < H; ++y)
                reinterpret_cast<QRgb*>(img.scanLine(y))[x] = qRgb(rCO[y], gCO[y], bCO[y]);
        }
    } else {
        // ── Grayscale horizontal ─────────────────────────────────────────────
        std::vector<int> buf(W), out(W);
        for (int y = 0; y < H; ++y) {
            uchar* row = img.scanLine(y);
            for (int x = 0; x < W; ++x) buf[x] = row[x];
            int s = 0;
            for (int k = 0; k <= std::min(r, W-1); ++k) s += buf[k];
            for (int x = 0; x < W; ++x) {
                out[x] = s / (std::min(x+r+1, W) - std::max(0, x-r));
                if (x+r+1 < W) s += buf[x+r+1];
                if (x-r   >= 0) s -= buf[x-r];
            }
            for (int x = 0; x < W; ++x) row[x] = static_cast<uchar>(out[x]);
        }
        // ── Grayscale vertical ───────────────────────────────────────────────
        std::vector<int> col(H), colO(H);
        for (int x = 0; x < W; ++x) {
            for (int y = 0; y < H; ++y) col[y] = img.constScanLine(y)[x];
            int s = 0;
            for (int k = 0; k <= std::min(r, H-1); ++k) s += col[k];
            for (int y = 0; y < H; ++y) {
                colO[y] = s / (std::min(y+r+1, H) - std::max(0, y-r));
                if (y+r+1 < H) s += col[y+r+1];
                if (y-r   >= 0) s -= col[y-r];
            }
            for (int y = 0; y < H; ++y) img.scanLine(y)[x] = static_cast<uchar>(colO[y]);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main image provider
// ─────────────────────────────────────────────────────────────────────────────
QImage FitsImageProvider::requestImage(const QString &id, QSize *size, const QSize &requestedSize)
{
    // Split "encodedPath?a=0.1&p=99.0" into path and optional stretch params.
    const int qmark = id.indexOf('?');
    const QString path = QUrl::fromPercentEncoding(
        (qmark >= 0 ? id.left(qmark) : id).toUtf8());

    double stretchA = 0.1, stretchP = 99.0;
    int    denoiseR = 0;
    if (qmark >= 0) {
        for (const auto& part : id.mid(qmark + 1).split('&')) {
            const int eq = part.indexOf('=');
            if (eq < 0) continue;
            const double val = part.mid(eq + 1).toDouble();
            const QString key = part.left(eq);
            if      (key == "a") stretchA = qBound(0.001, val, 10.0);
            else if (key == "p") stretchP = qBound(50.0,  val, 99.99);
            else if (key == "d") denoiseR = qBound(0, static_cast<int>(val), 10);
        }
    }

    QFile file(path);
    if (!file.open(QIODevice::ReadOnly))
        return {};

    // ── Parse FITS header ────────────────────────────────────────────────────
    int    bitpix = 0, naxis = 0, naxis1 = 0, naxis2 = 0, naxis3 = 1;
    double bzero  = 0.0, bscale = 1.0;
    QString bayerPat;    // non-empty → OSC Bayer mosaic (RGGB / GRBG / GBRG / BGGR)
    bool   endFound = false;

    while (!endFound && !file.atEnd()) {
        const QByteArray block = file.read(2880);
        const int cards = block.size() / 80;
        for (int ci = 0; ci < cards; ++ci) {
            const char *c = block.constData() + ci * 80;
            if (std::strncmp(c, "END     ", 8) == 0) { endFound = true; break; }
            if (c[8] != '=') continue;

            const QByteArray key = QByteArray(c, 8).trimmed();
            int slashAt = 80;
            for (int j = 10; j < 80; ++j)
                if (c[j] == '/' && (j < 11 || c[j-1] != '\'')) { slashAt = j; break; }

            const QString valStr = QString::fromLatin1(c + 10, slashAt - 10).trimmed();
            const double  dval   = valStr.toDouble();
            const int     ival   = static_cast<int>(dval);

            if      (key == "BITPIX") bitpix = ival;
            else if (key == "NAXIS")  naxis  = ival;
            else if (key == "NAXIS1") naxis1 = ival;
            else if (key == "NAXIS2") naxis2 = ival;
            else if (key == "NAXIS3") naxis3 = ival;
            else if (key == "BZERO")  bzero  = dval;
            else if (key == "BSCALE") bscale = dval;
            else if (key == "BAYERPAT") {
                // FITS string value format: 'RGGB    '  — strip quotes and whitespace
                QString s = valStr;
                if (s.startsWith('\'')) s = s.mid(1);
                if (s.endsWith('\''))   s = s.left(s.size() - 1);
                s = s.trimmed().toUpper();
                if (s == "RGGB" || s == "GRBG" || s == "GBRG" || s == "BGGR")
                    bayerPat = s;
            }
        }
    }

    if (!endFound || naxis < 2 || naxis1 <= 0 || naxis2 <= 0)
        return {};

    // ── Read pixel data ──────────────────────────────────────────────────────
    const int    bpp     = std::abs(bitpix) / 8;
    const qint64 planes  = (naxis >= 3) ? naxis3 : 1;
    const qint64 ppPlane = (qint64)naxis1 * naxis2;
    const qint64 dataBytes = ppPlane * planes * bpp;

    if (dataBytes > 512LL * 1024 * 1024)
        return {};

    const QByteArray raw = file.read(dataBytes);
    file.close();
    if ((qint64)raw.size() < dataBytes)
        return {};

    const uchar *d = reinterpret_cast<const uchar *>(raw.constData());

    // ── Decode one pixel to physical value (big-endian FITS → float) ────────
    const auto px = [&](qint64 idx) -> float {
        const uchar *p = d + idx * bpp;
        double v = 0.0;
        switch (bitpix) {
        case 8:
            v = p[0];
            break;
        case 16: {
            const quint16 u = (quint16(p[0]) << 8) | p[1];
            v = static_cast<qint16>(u);
            break;
        }
        case 32: {
            const quint32 u = (quint32(p[0])<<24)|(quint32(p[1])<<16)|(quint32(p[2])<<8)|p[3];
            v = static_cast<qint32>(u);
            break;
        }
        case -32: {
            quint32 u = (quint32(p[0])<<24)|(quint32(p[1])<<16)|(quint32(p[2])<<8)|p[3];
            float f; std::memcpy(&f, &u, 4);
            v = f;
            break;
        }
        case -64: {
            quint64 u = 0;
            for (int b = 0; b < 8; ++b) u = (u << 8) | p[b];
            double f; std::memcpy(&f, &u, 8);
            v = f;
            break;
        }
        }
        return static_cast<float>(bzero + bscale * v);
    };

    // ── Sample one plane uniformly → sorted vector (for stretch params) ──────
    const int kSampleN = std::min((int)ppPlane, 100000);
    const auto samplePlane = [&](qint64 off) -> std::vector<float> {
        const float step = (float)ppPlane / kSampleN;
        std::vector<float> s(kSampleN);
        for (int i = 0; i < kSampleN; ++i)
            s[i] = px(off + (qint64)(i * step));
        std::sort(s.begin(), s.end());
        return s;
    };

    // ── Apply PercentileInterval+AsinhStretch to one plane → 8-bit output ────
    const auto applyStretch = [&](qint64 off, const StretchParams& sp) -> std::vector<uchar> {
        const double range = sp.vmax - sp.vmin;
        std::vector<uchar> out(ppPlane);
        for (qint64 i = 0; i < ppPlane; ++i) {
            const double xn = std::max(0.0, std::min(1.0,
                              (static_cast<double>(px(off + i)) - sp.vmin) / range));
            out[i] = static_cast<uchar>(asinhStretch(xn, stretchA) * 255.0 + 0.5);
        }
        return out;
    };

    // ── Build QImage (FITS stores rows bottom-up → y-flip on write) ─────────
    const int W = naxis1, H = naxis2;
    QImage image;

    // ── Branch 1: OSC Bayer mosaic ───────────────────────────────────────────
    // OSC (one-shot colour) cameras store a single 2-D plane with a Bayer CFA
    // pattern.  NAXIS=2, so planes==1 and the file looks monochrome unless we
    // demosaic it.  We detect this via the standard BAYERPAT FITS keyword.
    if (!bayerPat.isEmpty() && planes == 1 && W >= 2 && H >= 2) {

        // Colour index (0=R, 1=G, 2=B) at Bayer position (x, y).
        // The four patterns each define the colour at the four cells of the
        // repeating 2×2 block: [TL, TR, BL, BR] = cell indices 0,1,2,3.
        static constexpr int bayerTable[4][4] = {
            {0, 1, 1, 2},   // RGGB
            {1, 0, 2, 1},   // GRBG
            {1, 2, 0, 1},   // GBRG
            {2, 1, 1, 0},   // BGGR
        };
        const int patIdx = (bayerPat == "RGGB") ? 0 :
                           (bayerPat == "GRBG") ? 1 :
                           (bayerPat == "GBRG") ? 2 : 3;

        const auto bayerColor = [&](int x, int y) -> int {
            return bayerTable[patIdx][((y & 1) << 1) | (x & 1)];
        };

        // Boundary-reflect pixel access so edge interpolation stays correct.
        // reflect(-1, W)   = 1      (mirrors at x=0)
        // reflect(W, W)    = W-2    (mirrors at x=W-1)
        const auto reflectCoord = [](int v, int max) -> int {
            if (v < 0)    return -v;
            if (v >= max) return 2 * max - 2 - v;
            return v;
        };
        const auto rp = [&](int x, int y) -> float {
            return px((qint64)reflectCoord(y, H) * W + reflectCoord(x, W));
        };

        // Determine the (dx, dy) offset of each colour within the 2×2 Bayer block.
        // Sampling by 2×2 blocks guarantees all four cell types are visited even
        // when the image width is even (a linear step of any even size would only
        // ever land on the same column parity, silently missing one colour entirely).
        int rDx = 0, rDy = 0, bDx = 0, bDy = 0;
        int g1Dx = 0, g1Dy = 0, g2Dx = 0, g2Dy = 0;
        bool foundG1 = false;
        for (int dy = 0; dy < 2; ++dy) {
            for (int dx = 0; dx < 2; ++dx) {
                const int c = bayerTable[patIdx][(dy << 1) | dx];
                if      (c == 0)   { rDx  = dx; rDy  = dy; }
                else if (c == 2)   { bDx  = dx; bDy  = dy; }
                else if (!foundG1) { g1Dx = dx; g1Dy = dy; foundG1 = true; }
                else               { g2Dx = dx; g2Dy = dy; }
            }
        }

        // Sample each 2×2 block at a regular spatial stride, collecting the
        // native pixel of each colour from its known position in the block.
        const int nBlocksX = W / 2;
        const int nBlocksY = H / 2;
        const int blockStride = std::max(1, (int)std::sqrt((double)(nBlocksX * nBlocksY) / 25000.0));

        std::vector<float> rSamp, gSamp, bSamp;
        rSamp.reserve(25000); gSamp.reserve(50000); bSamp.reserve(25000);

        for (int bby = 0; bby < nBlocksY; bby += blockStride) {
            for (int bbx = 0; bbx < nBlocksX; bbx += blockStride) {
                const int baseX = bbx * 2;
                const int baseY = bby * 2;
                rSamp.push_back(px((qint64)(baseY + rDy) * W + (baseX + rDx)));
                gSamp.push_back(px((qint64)(baseY + g1Dy) * W + (baseX + g1Dx)));
                gSamp.push_back(px((qint64)(baseY + g2Dy) * W + (baseX + g2Dx)));
                bSamp.push_back(px((qint64)(baseY + bDy) * W + (baseX + bDx)));
            }
        }
        std::sort(rSamp.begin(), rSamp.end());
        std::sort(gSamp.begin(), gSamp.end());
        std::sort(bSamp.begin(), bSamp.end());

        const auto pR = computeParams(rSamp, stretchP);
        const auto pG = computeParams(gSamp, stretchP);
        const auto pB = computeParams(bSamp, stretchP);

        // Bilinear demosaicing + per-channel astropy stretch in a single pass.
        //
        // For an R pixel at (x, y):
        //   its 4 orthogonal neighbours are all G  → G interpolated from those
        //   its 4 diagonal neighbours are all B    → B interpolated from those
        //
        // For a B pixel at (x, y): same relationship with R and G swapped.
        //
        // For a G pixel at (x, y):
        //   its horizontal neighbours are either both R or both B (never mixed)
        //   its vertical neighbours are the other colour
        //   we detect which by checking bayerColor(x+1, y) — works for all patterns.
        image = QImage(W, H, QImage::Format_RGB32);
        for (int y = 0; y < H; ++y) {
            QRgb *line = reinterpret_cast<QRgb *>(image.scanLine(H - 1 - y));
            for (int x = 0; x < W; ++x) {
                const float p = px((qint64)y * W + x);
                const int   c = bayerColor(x, y);
                float r, g, b;

                if (c == 0) {           // R pixel
                    r = p;
                    g = (rp(x-1,y) + rp(x+1,y) + rp(x,y-1) + rp(x,y+1)) * 0.25f;
                    b = (rp(x-1,y-1) + rp(x+1,y-1) + rp(x-1,y+1) + rp(x+1,y+1)) * 0.25f;
                } else if (c == 2) {    // B pixel
                    b = p;
                    g = (rp(x-1,y) + rp(x+1,y) + rp(x,y-1) + rp(x,y+1)) * 0.25f;
                    r = (rp(x-1,y-1) + rp(x+1,y-1) + rp(x-1,y+1) + rp(x+1,y+1)) * 0.25f;
                } else {                // G pixel
                    g = p;
                    const int hc = bayerColor(x + 1, y);   // R or B in horizontal direction
                    const float hv = (rp(x-1,y) + rp(x+1,y)) * 0.5f;
                    const float vv = (rp(x,y-1) + rp(x,y+1)) * 0.5f;
                    if (hc == 0) { r = hv; b = vv; }
                    else         { b = hv; r = vv; }
                }

                // Per-channel PercentileInterval + AsinhStretch
                const double rn = std::max(0.0, std::min(1.0, (r - pR.vmin) / (pR.vmax - pR.vmin)));
                const double gn = std::max(0.0, std::min(1.0, (g - pG.vmin) / (pG.vmax - pG.vmin)));
                const double bn = std::max(0.0, std::min(1.0, (b - pB.vmin) / (pB.vmax - pB.vmin)));

                line[x] = qRgb(
                    static_cast<int>(asinhStretch(rn, stretchA) * 255.0 + 0.5),
                    static_cast<int>(asinhStretch(gn, stretchA) * 255.0 + 0.5),
                    static_cast<int>(asinhStretch(bn, stretchA) * 255.0 + 0.5)
                );
            }
        }

    // ── Branch 2: 3-plane colour FITS ────────────────────────────────────────
    } else if (planes >= 3) {
        // Per-channel (unlinked) stretch.
        const auto p0 = computeParams(samplePlane(0),           stretchP);
        const auto p1 = computeParams(samplePlane(ppPlane),     stretchP);
        const auto p2 = computeParams(samplePlane(ppPlane * 2), stretchP);

        const auto R = applyStretch(0,           p0);
        const auto G = applyStretch(ppPlane,     p1);
        const auto B = applyStretch(ppPlane * 2, p2);

        image = QImage(W, H, QImage::Format_RGB32);
        for (int y = 0; y < H; ++y) {
            QRgb *line = reinterpret_cast<QRgb *>(image.scanLine(H - 1 - y));
            for (int x = 0; x < W; ++x) {
                const int i = y * W + x;
                line[x] = qRgb(R[i], G[i], B[i]);
            }
        }

    // ── Branch 3: single-plane monochrome ────────────────────────────────────
    } else {
        const auto sp = computeParams(samplePlane(0), stretchP);
        const auto L  = applyStretch(0, sp);

        image = QImage(W, H, QImage::Format_Grayscale8);
        for (int y = 0; y < H; ++y) {
            uchar *line = image.scanLine(H - 1 - y);
            std::memcpy(line, L.data() + y * W, W);
        }
    }

    applyBoxBlur(image, denoiseR);

    if (size)
        *size = image.size();

    return (requestedSize.isValid() && requestedSize != image.size())
           ? image.scaled(requestedSize, Qt::KeepAspectRatio, Qt::SmoothTransformation)
           : image;
}
