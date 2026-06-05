#include "weatherservice.h"
#include <QNetworkReply>
#include <QJsonDocument>
#include <QJsonArray>
#include <QJsonObject>
#include <QUrlQuery>
#include <QSettings>
#include <QTimeZone>
#include <cmath>

// - Initialize weather service and restore saved settings for units and location -
WeatherService::WeatherService(QObject *parent)
    : QObject(parent)
    , m_network(new QNetworkAccessManager(this))
{
    QSettings settings;
    m_celsius = settings.value("weather/useCelsius", true).toBool();
    m_latitude = settings.value("weather/latitude", 0).toDouble();
    m_longitude = settings.value("weather/longitude", 0).toDouble();
}

bool WeatherService::isCelsius() const { return m_celsius; }
double WeatherService::latitude() const { return m_latitude; }
double WeatherService::longitude() const { return m_longitude; }

// - Update the weather location and persist it to settings -
void WeatherService::setLocation(double lat, double lon)
{
    m_latitude = lat;
    m_longitude = lon;
    QSettings settings;
    settings.setValue("weather/latitude", lat);
    settings.setValue("weather/longitude", lon);
    emit locationChanged();
}

// - Switch between Celsius and Fahrenheit display units -
void WeatherService::toggleUnit()
{
    m_celsius = !m_celsius;
    QSettings settings;
    settings.setValue("weather/useCelsius", m_celsius);
    emit unitChanged();
    emit weatherUpdated();
}

// - Fetch historical and forecast weather from Open-Meteo for the selected month -
void WeatherService::fetchWeather(int year, int month)
{
    m_currentYear = year;
    m_currentMonth = month;

    if (m_latitude == 0 && m_longitude == 0) return;
    if (m_network->findChildren<QNetworkReply*>().size() > 5) return;

    QDate today = QDate::currentDate();
    QDate firstOfMonth(year, month, 1);

    // Historical weather
    if (firstOfMonth < today) {
        QDate endDate = qMin(today, QDate(year, month, firstOfMonth.daysInMonth()));
        QUrl url("https://archive-api.open-meteo.com/v1/archive");
        QUrlQuery query;
        query.addQueryItem("latitude", QString::number(m_latitude));
        query.addQueryItem("longitude", QString::number(m_longitude));
        query.addQueryItem("hourly", "cloud_cover,relative_humidity_2m,temperature_2m");
        query.addQueryItem("daily", "weather_code");
        query.addQueryItem("start_date", firstOfMonth.toString("yyyy-MM-dd"));
        query.addQueryItem("end_date", endDate.toString("yyyy-MM-dd"));
        query.addQueryItem("timezone", "auto");
        url.setQuery(query);

        QNetworkReply *reply = m_network->get(QNetworkRequest(url));
        connect(reply, &QNetworkReply::finished, this, [this, reply]() {
            if (reply->error() == QNetworkReply::NoError) {
                QJsonDocument doc = QJsonDocument::fromJson(reply->readAll());
                parseWeatherResponse(doc.object());
            }
            reply->deleteLater();
        });
    }

    // Forecast weather
    QUrl forecastUrl("https://api.open-meteo.com/v1/forecast");
    QUrlQuery forecastQuery;
    forecastQuery.addQueryItem("latitude", QString::number(m_latitude));
    forecastQuery.addQueryItem("longitude", QString::number(m_longitude));
    forecastQuery.addQueryItem("hourly", "cloud_cover,relative_humidity_2m,temperature_2m");
    forecastQuery.addQueryItem("daily", "weather_code");
    forecastQuery.addQueryItem("start_date", today.toString("yyyy-MM-dd"));
    forecastQuery.addQueryItem("timezone", "auto");
    forecastQuery.addQueryItem("forecast_days", "16");
    forecastUrl.setQuery(forecastQuery);

    QNetworkReply *forecastReply = m_network->get(QNetworkRequest(forecastUrl));
    connect(forecastReply, &QNetworkReply::finished, this, [this, forecastReply]() {
        if (forecastReply->error() == QNetworkReply::NoError) {
            QJsonDocument doc = QJsonDocument::fromJson(forecastReply->readAll());
            parseWeatherResponse(doc.object());
        }
        forecastReply->deleteLater();
        emit weatherUpdated();
    });
}

// - Parse API response JSON and populate the weather cache per day -
void WeatherService::parseWeatherResponse(const QJsonObject &data)
{
    QJsonObject daily = data["daily"].toObject();
    QJsonArray times = daily["time"].toArray();
    QJsonArray codes = daily["weather_code"].toArray();

    for (int i = 0; i < times.size() && i < codes.size(); i++) {
        QString date = times[i].toString();
        WeatherData wd;
        wd.weatherCode = codes[i].toInt();
        wd.valid = true;
        m_weatherCache[date] = wd;
    }

    QJsonObject hourly = data["hourly"].toObject();
    QJsonArray hTimes = hourly["time"].toArray();
    QJsonArray clouds = hourly["cloud_cover"].toArray();
    QJsonArray humidity = hourly["relative_humidity_2m"].toArray();
    QJsonArray temps = hourly["temperature_2m"].toArray();

    QMap<QString, QVector<double>> dailyClouds, dailyHumidity, nightlyTemps;

    for (int i = 0; i < hTimes.size(); i++) {
        QString dt = hTimes[i].toString();
        QString day = dt.left(10);
        int hour = dt.mid(11, 2).toInt();

        if (hour >= 20 || hour < 6) {
            if (i < temps.size() && !temps[i].isNull())
                nightlyTemps[day].append(temps[i].toDouble());
        }

        if (i < clouds.size() && !clouds[i].isNull())
            dailyClouds[day].append(clouds[i].toDouble());
        if (i < humidity.size() && !humidity[i].isNull())
            dailyHumidity[day].append(humidity[i].toDouble());
    }

    for (auto it = dailyClouds.begin(); it != dailyClouds.end(); ++it) {
        WeatherData &wd = m_weatherCache[it.key()];
        const auto &vals = it.value();
        if (!vals.isEmpty()) {
            double sum = 0;
            for (double v : vals) sum += v;
            wd.avgCloud = sum / vals.size();
        }
    }

    for (auto it = dailyHumidity.begin(); it != dailyHumidity.end(); ++it) {
        WeatherData &wd = m_weatherCache[it.key()];
        const auto &vals = it.value();
        if (!vals.isEmpty()) {
            double sum = 0;
            for (double v : vals) sum += v;
            wd.avgHumidity = sum / vals.size();
        }
    }

    for (auto it = nightlyTemps.begin(); it != nightlyTemps.end(); ++it) {
        WeatherData &wd = m_weatherCache[it.key()];
        const auto &vals = it.value();
        if (!vals.isEmpty()) {
            double sum = 0;
            for (double v : vals) sum += v;
            wd.nightTemp = sum / vals.size();
        }
    }
}

QVariantMap WeatherService::weatherForDate(const QString &dateStr) const
{
    const WeatherData wd = m_weatherCache.value(dateStr);
    return {
        {"valid",       wd.valid},
        {"weatherCode", wd.weatherCode},
        {"avgCloud",    wd.avgCloud},
        {"avgHumidity", wd.avgHumidity},
        {"nightTemp",   wd.nightTemp}
    };
}

// - Convert weather conditions and cloud cover into a matching emoji icon -
QString WeatherService::getWeatherEmoji(int weatherCode, double avgCloud) const
{
    if (avgCloud < 20) return "☀️";
    if (avgCloud < 50) return "⛅";
    if (avgCloud < 80) return "☁️";
    if (weatherCode >= 95) return "⛈️";
    if (weatherCode >= 80) return "🌧️";
    if (weatherCode >= 71) return "🌨️";
    if (weatherCode >= 61) return "🌧️";
    if (weatherCode >= 51) return "🌨️";
    if (weatherCode >= 45) return "🌫️";
    return "☁️";
}

// - Compute the moon phase indicator for the given date -
QString WeatherService::getMoonPhase(const QDateTime &date) const
{
    const double lunarCycle = 29.53058867;
    QDateTime knownNewMoon(QDate(2000, 1, 6), QTime(18, 14, 0), QTimeZone("UTC"));
    double diffDays = knownNewMoon.secsTo(date) / (24.0 * 3600.0);
    double daysSinceNewMoon = std::fmod(diffDays, lunarCycle);
    if (daysSinceNewMoon < 0) daysSinceNewMoon += lunarCycle;
    int phase = static_cast<int>(std::floor((daysSinceNewMoon / lunarCycle) * 8)) % 8;

    static const QStringList phases = {
        "🌑", "🌒", "🌓", "🌔",
        "🌕", "🌖", "🌗", "🌘"
    };
    return phases[phase];
}
