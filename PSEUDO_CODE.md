# 📝 Pseudo Code - Weather Forest App

## 🚀 App Initialization

```
FUNCTION App_Start()
    INITIALIZE SafeAreaProvider
    INITIALIZE LocationProvider
        SET default_location = Hà Nội (21.0285, 105.8542)
        SET loading = true
        CALL requestLocationPermission()
        IF permission_granted THEN
            CALL getCurrentGPSLocation()
            CALL reverseGeocode(latitude, longitude)
            CALL findLocationId(latitude, longitude)
            SET location = {lat, lon, city, country, location_id}
        ELSE
            SET location = default_location
        END IF
        SET loading = false
    END INITIALIZE
    
    INITIALIZE WeatherProvider
        WAIT FOR location
        CALL fetchWeatherData(location)
        CALL requestNotificationPermissions()
    END INITIALIZE
    
    INITIALIZE AlertProvider
        CALL fetchAlerts()
        CALL requestNotificationPermissions()
    END INITIALIZE
    
    INITIALIZE AppNavigator
        CREATE BottomTabNavigator
        REGISTER screens: Home, FloodRisk, Hourly, Weekly, Overview
        SET default_screen = Home
    END INITIALIZE
END FUNCTION
```

## 📍 Location Management

```
FUNCTION requestLocationPermission()
    GET current_permission_status
    IF current_permission_status != 'granted' THEN
        REQUEST permission from user
        SET final_status = user_response
    ELSE
        SET final_status = 'granted'
    END IF
    
    IF final_status == 'granted' THEN
        RETURN true
    ELSE
        SET error = "Permission denied"
        RETURN false
    END IF
END FUNCTION

FUNCTION getCurrentGPSLocation()
    SET timeout = 10 seconds
    TRY
        GET position = Location.getCurrentPositionAsync({
            accuracy: Balanced
        })
        WITH timeout
        
        SET latitude = position.coords.latitude
        SET longitude = position.coords.longitude
        RETURN {latitude, longitude}
    CATCH timeout_error
        SET error = "Location timeout"
        RETURN default_location
    CATCH other_error
        SET error = "Location error"
        RETURN default_location
    END TRY
END FUNCTION

FUNCTION findLocationId(latitude, longitude)
    LOAD vietnam_provinces_data
    FOR EACH province IN provinces
        IF point_in_polygon(latitude, longitude, province.boundary) THEN
            RETURN province.location_id
        END IF
    END FOR
    RETURN undefined
END FUNCTION

FUNCTION updateLocation(new_location)
    SET location = new_location
    TRIGGER WeatherProvider.refetch()
END FUNCTION
```

## 🌤️ Weather Data Fetching

```
FUNCTION fetchWeatherData(location)
    SET loading = true
    SET error = null
    
    IF location == null THEN
        SET error = "Location not available"
        SET loading = false
        RETURN
    END IF
    
    TRY
        SET location_id = location.location_id
        SET model_provider = 'XGBoost' // default
        
        // Load JSON files based on location_id
        IF file_exists("data/{location_id}/latest.json") THEN
            LOAD latest_data = read_json("data/{location_id}/latest.json")
        ELSE
            LOAD latest_data = read_json("data/latest.json") // fallback
        END IF
        
        IF file_exists("data/{location_id}/timeseries.json") THEN
            LOAD timeseries_data = read_json("data/{location_id}/timeseries.json")
        ELSE
            LOAD timeseries_data = read_json("data/timeseries.json") // fallback
        END IF
        
        PARSE weather_data = {
            location: location,
            current: latest_data.current,
            hourly: timeseries_data.steps,
            daily: latest_data.daily,
            overallAlertLevel: latest_data.overall_alert_level,
            overallAlertComment: latest_data.overall_alert_comment
        }
        
        SET weatherData = weather_data
        SET loading = false
        
    CATCH error
        SET error = error.message
        SET loading = false
    END TRY
END FUNCTION

FUNCTION refreshWeather()
    CALL fetchWeatherData(current_location)
END FUNCTION
```

## 🔔 Notification System

### Request Permissions

```
FUNCTION requestNotificationPermissions()
    GET existing_permission_status
    
    IF existing_permission_status != 'granted' THEN
        REQUEST permission from user
        SET final_status = user_response
    ELSE
        SET final_status = 'granted'
    END IF
    
    IF final_status != 'granted' THEN
        RETURN false
    END IF
    
    IF platform == 'android' THEN
        CREATE notification_channel({
            id: 'weather-alerts',
            name: 'Cảnh báo thời tiết',
            importance: HIGH,
            vibration: [0, 250, 250, 250],
            sound: true
        })
    END IF
    
    RETURN true
END FUNCTION
```

### Send Immediate Notification

```
FUNCTION sendNotification(title, body, data)
    IF permission_not_granted THEN
        RETURN null
    END IF
    
    TRY
        CREATE notification = {
            content: {
                title: title,
                body: body,
                data: data,
                sound: true,
                priority: HIGH
            },
            trigger: null // immediate
        }
        
        SEND notification
        RETURN notification_id
    CATCH error
        LOG error
        RETURN null
    END TRY
END FUNCTION

FUNCTION scheduleNotification(title, body, seconds, data)
    IF permission_not_granted THEN
        RETURN null
    END IF
    
    IF seconds < 60 THEN
        SET seconds = 60 // minimum 1 minute
    END IF
    
    TRY
        CREATE notification = {
            content: {
                title: title,
                body: body,
                data: data,
                sound: true,
                priority: HIGH
            },
            trigger: {
                seconds: seconds
            }
        }
        
        SCHEDULE notification
        RETURN notification_id
    CATCH error
        LOG error
        RETURN null
    END TRY
END FUNCTION
```

### Weather Alert Notification

```
FUNCTION sendWeatherAlertNotification(alert)
    // Format giống AlertCard UI
    SET severity_config = {
        extreme: {emoji: '🔴', text: 'EXTREME'},
        severe: {emoji: '🟠', text: 'SEVERE'},
        moderate: {emoji: '🟡', text: 'MODERATE'},
        minor: {emoji: '🟢', text: 'MINOR'}
    }
    
    SET config = severity_config[alert.severity]
    SET urgency_text = formatUrgencyText(alert.urgency, alert.startTime, alert.endTime)
    
    SET title = "{config.emoji} [{config.text}] {alert.title}"
    SET body = "{alert.description}\n\n📍 {alert.area}\n⏰ {urgency_text}"
    
    SET data = {
        type: 'weather_alert',
        alertId: alert.id,
        severity: alert.severity,
        area: alert.area,
        urgency: alert.urgency,
        startTime: alert.startTime,
        endTime: alert.endTime
    }
    
    RETURN sendNotification(title, body, data)
END FUNCTION
```

### Overall Alert Notification

```
FUNCTION sendOverallAlertNotification(level, comment, location)
    SET level_config = {
        extreme: {emoji: '🔴', title: 'Cảnh báo cực kỳ nguy hiểm'},
        severe: {emoji: '🟠', title: 'Cảnh báo nghiêm trọng'},
        moderate: {emoji: '🟡', title: 'Cảnh báo vừa phải'},
        none: {emoji: '✅', title: 'Tình trạng thời tiết'},
        default: {emoji: 'ℹ️', title: 'Thông tin thời tiết'}
    }
    
    SET config = level_config[level] OR level_config.default
    
    SET title = "{config.emoji} {config.title}"
    SET body = comment
    
    SET data = {
        type: 'overall_alert',
        level: level,
        comment: comment,
        location: location
    }
    
    RETURN sendNotification(title, body, data)
END FUNCTION
```

### Calculate Start Time for Recurring Notifications

```
FUNCTION calculateStartTime(interval_minutes)
    SET now = current_time()
    SET current_minutes = now.getMinutes()
    SET current_hours = now.getHours()
    
    // Tính phút tiếp theo chia hết cho interval
    // Ví dụ: 14:23, interval=30 → next_interval = 30 (14:30)
    //        14:30, interval=30 → next_interval = 60 (15:00)
    SET next_interval = CEIL((current_minutes + 1) / interval_minutes) * interval_minutes
    
    SET target_hour = current_hours
    SET target_minute = next_interval
    
    // Nếu vượt quá 60 phút, chuyển sang giờ tiếp theo
    IF target_minute >= 60 THEN
        SET target_hour = (target_hour + 1) MOD 24
        SET target_minute = target_minute MOD 60
    END IF
    
    // Tạo Date object
    SET base_date = new Date()
    base_date.setHours(target_hour, target_minute, 0, 0)
    
    // Nếu thời gian đã qua, chuyển sang ngày mai
    IF base_date <= now THEN
        base_date.setDate(base_date.getDate() + 1)
    END IF
    
    RETURN {hour: target_hour, minute: target_minute, baseDate: base_date}
END FUNCTION
```

### Calculate Schedule Count

```
FUNCTION calculateScheduleCount(interval_minutes, days = 30)
    SET minutes_per_day = 24 * 60
    SET total_minutes = minutes_per_day * days
    SET count = FLOOR(total_minutes / interval_minutes)
    RETURN count
END FUNCTION
```

### Schedule Recurring Notifications

```
FUNCTION scheduleRecurringWeatherNotifications(
    interval_minutes,
    getNotificationContent,
    cancel_existing = true
)
    // Check permission
    IF NOT requestNotificationPermissions() THEN
        RETURN []
    END IF
    
    // Validate interval
    IF interval_minutes <= 0 OR interval_minutes > 1440 THEN
        ERROR "Interval must be 1-1440 minutes"
        RETURN []
    END IF
    
    // Cancel existing if needed
    IF cancel_existing THEN
        CANCEL all scheduled notifications
    END IF
    
    // Platform limits
    IF platform == 'ios' THEN
        SET max_notifications = 64
    ELSE
        SET max_notifications = 200
    END IF
    
    // Calculate schedule count
    SET schedule_days = 30
    SET schedule_count = calculateScheduleCount(interval_minutes, schedule_days)
    
    // Apply platform limit
    IF schedule_count > max_notifications THEN
        SET schedule_count = max_notifications
        WARN "Exceeded platform limit, scheduling only {max_notifications}"
    END IF
    
    // Calculate start time
    SET start_time = calculateStartTime(interval_minutes)
    
    // Get notification content
    SET content = getNotificationContent()
    
    SET notification_ids = []
    SET success_count = 0
    SET error_count = 0
    SET consecutive_errors = 0
    SET max_consecutive_errors = 5
    
    // Schedule notifications
    FOR i = 0 TO schedule_count - 1
        IF consecutive_errors >= max_consecutive_errors THEN
            BREAK // Stop if too many errors
        END IF
        
        TRY
            // Calculate target time
            SET target_time = start_time.baseDate
            target_time.setMinutes(target_time.getMinutes() + i * interval_minutes)
            
            // Calculate seconds until target
            SET now = current_time()
            SET seconds_until = FLOOR((target_time - now) / 1000)
            
            // Minimum 1 minute in future
            IF seconds_until < 60 THEN
                SET seconds_until = 60
            END IF
            
            // Schedule notification
            SET notification_id = scheduleNotification(
                content.title,
                content.body,
                seconds_until,
                content.data
            )
            
            IF notification_id != null THEN
                ADD notification_id TO notification_ids
                INCREMENT success_count
                SET consecutive_errors = 0
            ELSE
                INCREMENT error_count
                INCREMENT consecutive_errors
            END IF
            
        CATCH error
            INCREMENT error_count
            INCREMENT consecutive_errors
            LOG error
        END TRY
    END FOR
    
    LOG "Scheduled {success_count} notifications, {error_count} errors"
    RETURN notification_ids
END FUNCTION
```

### Auto Reschedule

```
FUNCTION autoRescheduleIfNeeded(interval_minutes, getNotificationContent, threshold = 10)
    SET current_count = getScheduledNotificationsCount()
    
    IF current_count >= threshold THEN
        RETURN // Enough notifications, no need to reschedule
    END IF
    
    LOG "Only {current_count} notifications remaining, rescheduling..."
    
    // Don't cancel existing, just add more
    SET new_ids = scheduleRecurringWeatherNotifications(
        interval_minutes,
        getNotificationContent,
        cancel_existing = false
    )
    
    RETURN new_ids
END FUNCTION

FUNCTION getScheduledNotificationsCount()
    GET all_scheduled_notifications
    RETURN COUNT(all_scheduled_notifications)
END FUNCTION

FUNCTION cancelAllScheduledNotifications()
    CANCEL all scheduled notifications
    RETURN true
END FUNCTION
```

## 🏠 Home Screen Logic

```
FUNCTION HomeScreen_Render()
    GET weatherData FROM WeatherProvider
    GET activeAlerts FROM AlertProvider
    GET location FROM LocationProvider
    
    IF loading AND weatherData == null THEN
        SHOW LoadingSpinner
        SHOW "Select location manually" button
        RETURN
    END IF
    
    IF error OR weatherData == null THEN
        SHOW error message
        SHOW "Retry" button
        SHOW "Select location" button
        RETURN
    END IF
    
    RENDER:
        - Location header with search button
        - WeatherCard (current weather with gradient)
        - StatCard grid (6 cards: wind, humidity, feels like, visibility, pressure, UV)
        - HourlyForecastCard (horizontal scroll, next 12 hours)
        - DailyForecastCard preview (3 days)
        - AlertCard section
            - Active alerts list
            - 🔔 Test notification button
            - 🔄 Reset notifications button
END FUNCTION

FUNCTION handleTestNotification()
    GET first_alert FROM activeAlerts
    IF no_alert THEN
        CREATE test_alert = {
            title: 'Cảnh báo mưa lớn',
            description: 'Test notification',
            severity: 'moderate',
            ...
        }
    END IF
    
    FORMAT notification LIKE AlertCard
    SCHEDULE notification after 10 seconds
    SHOW success message
END FUNCTION

FUNCTION handleResetNotifications()
    CALL cancelAllScheduledNotifications()
    SHOW success message "Đã reset tất cả thông báo"
END FUNCTION

FUNCTION handleLocationSearch()
    OPEN LocationSearchModal
    ON location_selected:
        CALL updateLocation(selected_location)
        CLOSE modal
END FUNCTION
```

## ⏰ Hourly Screen Logic

```
FUNCTION HourlyScreen_Render()
    GET weatherData FROM WeatherProvider
    GET timeseries_steps = weatherData.hourly
    
    IF loading THEN
        SHOW LoadingSpinner
        RETURN
    END IF
    
    // Find current time index
    SET current_time = current_time()
    SET current_index = 0
    FOR i = 0 TO timeseries_steps.length - 1
        IF timeseries_steps[i].valid_at <= current_time THEN
            SET current_index = i
        ELSE
            BREAK
        END IF
    END FOR
    
    SET initial_index = current_index
    
    RENDER:
        - Model selector (XGBoost, LightGBM, RidgeRegression, GRU)
        - 📅 Date/Time search button
        - Horizontal FlatList:
            FOR EACH step IN timeseries_steps
                RENDER renderHour(step, index)
            END FOR
        - "Scroll to current" button
        - Date/Time picker modal
END FUNCTION

FUNCTION renderHour(step, index)
    SET date = parseDate(step.valid_at)
    SET is_obs = step.source == 'obs'
    SET is_current = step.valid_at == current_step.valid_at
    SET is_past = step.valid_at < current_time
    SET is_future = step.valid_at > current_time
    
    SET condition = IF step.cloudcover_pct > 50 THEN 'Nhiều mây' ELSE 'Ít mây'
    SET icon = IF step.cloudcover_pct > 50 THEN '☁️' ELSE '⛅'
    
    RENDER:
        - Header: Day name, date, time, page indicator
        - Detail card:
            - Badges: Obs/Forecast, Past/Current/Future
            - Main info: Icon, temperature, condition
            - Details grid:
                - Wind speed (km/h)
                - Wind direction
                - Humidity (%)
                - Precipitation (mm)
                - Cloud cover (%)
                - Surface pressure (hPa)
END FUNCTION

FUNCTION getUniqueDates()
    GET all_steps = timeseries_steps
    SET date_map = new Map()
    
    FOR EACH step IN all_steps
        SET date = parseDate(step.valid_at)
        SET date_key = formatDate(date, 'DD/MM/YYYY')
        SET date_label = formatDate(date, 'weekday, DD/MM/YYYY')
        
        IF NOT date_map.has(date_key) THEN
            date_map.set(date_key, date_label)
        END IF
    END FOR
    
    SET unique_dates = Array.from(date_map.entries())
    SORT unique_dates BY date ASCENDING
    RETURN unique_dates
END FUNCTION

FUNCTION getAvailableTimes(selected_date)
    GET all_steps = timeseries_steps
    SET available_times = []
    
    FOR EACH step IN all_steps
        SET step_date = parseDate(step.valid_at)
        SET step_date_str = formatDate(step_date, 'DD/MM/YYYY')
        
        IF step_date_str == selected_date THEN
            SET step_time = formatTime(step_date, 'HH:mm')
            ADD {time: step_time, valid_at: step.valid_at} TO available_times
        END IF
    END FOR
    
    SORT available_times BY time ASCENDING
    RETURN available_times
END FUNCTION

FUNCTION handleSearchDateTime()
    IF selected_date == null OR selected_time == null THEN
        SHOW error "Please select both date and time"
        RETURN
    END IF
    
    // Find exact step matching date and time
    SET target_index = -1
    FOR i = 0 TO all_steps.length - 1
        SET step = all_steps[i]
        SET step_date = parseDate(step.valid_at)
        SET step_date_str = formatDate(step_date, 'DD/MM/YYYY')
        SET step_time = formatTime(step_date, 'HH:mm')
        
        IF step_date_str == selected_date AND step_time == selected_time THEN
            SET target_index = i
            BREAK
        END IF
    END FOR
    
    IF target_index >= 0 THEN
        CLOSE modal
        WAIT 100ms
        SCROLL FlatList TO index = target_index
        SET current_index = target_index
    ELSE
        SHOW error "No data found for selected time"
    END IF
END FUNCTION

FUNCTION scrollToCurrent()
    SET current_time = current_time()
    SET current_index = 0
    
    FOR i = 0 TO timeseries_steps.length - 1
        IF timeseries_steps[i].valid_at <= current_time THEN
            SET current_index = i
        ELSE
            BREAK
        END IF
    END FOR
    
    SCROLL FlatList TO index = current_index
    SET current_index = current_index
END FUNCTION
```

## 📅 Weekly Screen Logic

```
FUNCTION WeeklyScreen_Render()
    GET weatherData FROM WeatherProvider
    GET daily_forecast = weatherData.daily
    
    IF loading THEN
        SHOW LoadingSpinner
        RETURN
    END IF
    
    RENDER:
        - Header: Title, location
        - ScrollView:
            FOR EACH day IN daily_forecast (7 days)
                RENDER DailyForecastCard(day, index)
            END FOR
END FUNCTION

FUNCTION DailyForecastCard_Render(day, index)
    SET is_expanded = expanded_days.contains(index)
    
    RENDER:
        - Day name, date
        - High/Low temperature
        - Weather condition icon
        - Expandable details (if expanded):
            - Sunrise/Sunset time
            - Precipitation probability
            - Wind speed
            - Humidity
    
    ON press:
        TOGGLE expanded_days[index]
        RE-RENDER card
END FUNCTION
```

## ⚠️ Alert Management

```
FUNCTION AlertProvider_Initialize()
    SET alerts = []
    SET dismissed_alerts = new Set()
    SET previous_alerts = new Set()
    
    CALL fetchAlerts()
    CALL requestNotificationPermissions()
END FUNCTION

FUNCTION fetchAlerts()
    SET loading = true
    
    TRY
        // Simulate API call
        WAIT 500ms
        
        // In real app: fetch from API
        // For now: use sample data
        SET alerts = sampleAlerts
        
        SET loading = false
    CATCH error
        SET error = error.message
        SET loading = false
    END TRY
END FUNCTION

FUNCTION getActiveAlerts()
    SET now = current_time()
    SET active = []
    
    FOR EACH alert IN alerts
        IF NOT dismissed_alerts.contains(alert.id) THEN
            IF parseDate(alert.endTime) > now THEN
                ADD alert TO active
            END IF
        END IF
    END FOR
    
    RETURN active
END FUNCTION

FUNCTION checkNewAlerts()
    SET active_alerts = getActiveAlerts()
    SET active_ids = new Set(active_alerts.map(id))
    
    // Find new alerts
    SET new_alerts = []
    FOR EACH alert IN active_alerts
        IF NOT previous_alerts.contains(alert.id) THEN
            ADD alert TO new_alerts
        END IF
    END FOR
    
    // Send notifications for new alerts
    FOR EACH alert IN new_alerts
        CALL sendWeatherAlertNotification(alert)
    END FOR
    
    SET previous_alerts = active_ids
END FUNCTION

FUNCTION dismissAlert(alert_id)
    ADD alert_id TO dismissed_alerts
    RE-RENDER alerts list
END FUNCTION
```

## 🔄 Auto Reschedule Logic

```
FUNCTION WeatherProvider_AutoReschedule()
    IF weatherData == null THEN
        RETURN
    END IF
    
    SET checkAndReschedule = FUNCTION() {
        SET count = getScheduledNotificationsCount()
        LOG "Remaining notifications: {count}"
        
        IF count < 10 THEN
            CALL autoRescheduleIfNeeded(
                interval_minutes = 30,
                getNotificationContent = FUNCTION() {
                    RETURN formatOverallAlertNotification(weatherData)
                },
                threshold = 10
            )
        END IF
    }
    
    // Check immediately
    CALL checkAndReschedule()
    
    // Check every hour
    SET interval = setInterval(checkAndReschedule, 60 * 60 * 1000)
    
    ON unmount:
        CLEAR interval
END FUNCTION
```

## 📊 Overall Alert Change Detection

```
FUNCTION WeatherProvider_DetectOverallAlertChange()
    IF weatherData == null THEN
        RETURN
    END IF
    
    SET current_key = "{weatherData.overallAlertLevel}_{weatherData.overallAlertComment}"
    
    IF previous_key != current_key THEN
        CALL sendOverallAlertNotification(
            weatherData.overallAlertLevel,
            weatherData.overallAlertComment,
            weatherData.location.city
        )
        
        SET previous_key = current_key
    END IF
END FUNCTION
```

## 🎯 Main App Flow

```
FUNCTION App_Main()
    // 1. Initialize providers
    INITIALIZE LocationProvider
    INITIALIZE WeatherProvider
    INITIALIZE AlertProvider
    
    // 2. Setup navigation
    INITIALIZE AppNavigator
    SET default_screen = HomeScreen
    
    // 3. Request permissions
    CALL requestLocationPermission()
    CALL requestNotificationPermissions()
    
    // 4. Load initial data
    WAIT FOR location
    CALL fetchWeatherData(location)
    CALL fetchAlerts()
    
    // 5. Setup recurring notifications
    IF weatherData.overallAlertComment != null THEN
        CALL scheduleRecurringWeatherNotifications(
            interval_minutes = 30,
            getNotificationContent = formatOverallAlert,
            cancel_existing = false
        )
    END IF
    
    // 6. Setup auto-reschedule
    SET reschedule_interval = setInterval(
        checkAndReschedule,
        60 * 60 * 1000 // 1 hour
    )
    
    // 7. Monitor alert changes
    ON activeAlerts change:
        CALL checkNewAlerts()
    
    // 8. Monitor overall alert changes
    ON weatherData.overallAlertComment change:
        CALL sendOverallAlertNotification(...)
        CALL scheduleRecurringWeatherNotifications(...)
END FUNCTION
```

## 🔍 Location Search Logic

```
FUNCTION LocationSearchModal_Render()
    GET vietnam_provinces = loadVietnamProvinces()
    
    RENDER:
        - Search input
        - Province list (filtered by search)
    
    ON search_text_change:
        FILTER provinces WHERE name CONTAINS search_text
        RE-RENDER list
    
    ON province_selected:
        SET selected_location = {
            latitude: province.center_lat,
            longitude: province.center_lon,
            city: province.name,
            country: 'Việt Nam',
            location_id: province.location_id
        }
        
        CALL updateLocation(selected_location)
        CLOSE modal
END FUNCTION
```

## 📱 Navigation Flow

```
FUNCTION handleTabNavigation(tab_name)
    SWITCH tab_name:
        CASE 'Home':
            SHOW HomeScreen
        CASE 'FloodRisk':
            SHOW FloodRiskScreen
        CASE 'Hourly':
            SHOW HourlyScreen
        CASE 'Weekly':
            SHOW WeeklyScreen
        CASE 'Overview':
            SHOW OverviewScreen
    END SWITCH
END FUNCTION
```

## 🔄 Pull to Refresh

```
FUNCTION handlePullToRefresh()
    SET refreshing = true
    
    PARALLEL:
        CALL refreshWeather()
        CALL refreshAlerts()
    END PARALLEL
    
    SET refreshing = false
END FUNCTION
```

---

**Notes:**
- All async functions should use try-catch for error handling
- All state updates should trigger re-renders
- All user interactions should provide feedback
- All network operations should have timeout handling
- All permissions should be requested before use
- All notifications should respect platform limits

