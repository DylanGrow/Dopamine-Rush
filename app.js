// ====================================
// DOPAMINE RUSH - Main Application
// ====================================

class DopamineRush {
    constructor() {
        this.db = null;
        this.timer = null;
        this.timeRemaining = 0;
        this.isRunning = false;
        this.isWorkSession = true;
        this.sessionsCompletedToday = 0;
        this.currentSessionStartTime = null;
        this.pauseStartTime = null;
        this.isCompleting = false;
        this.tasks = [];
        this.sessions = [];
        this.audioContext = null;
        this.audioContextUnlocked = false;
        this.titleInterval = null;
        
        // Settings
        this.settings = {
            workDuration: 25,
            breakDuration: 5,
            longBreakDuration: 15,
            sessionsUntilLongBreak: 4,
            soundEnabled: true,
            vibrationEnabled: true,
            autoStartBreaks: false,
            autoStartPomodoros: false,
            volume: 30,
            desktopNotification: false
        };

        this.init();
    }

    async init() {
        // Register service worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').then(reg => {
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            document.getElementById('updatePrompt').hidden = false;
                            document.getElementById('updateAppBtn').onclick = () => {
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                            };
                        }
                    });
                });
            }).catch(() => {
                console.log('Service Worker registration failed');
            });

            let refreshing;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                refreshing = true;
                window.location.reload();
            });
        }

        // Initialize IndexedDB
        try {
            await this.initDB();
        } catch (error) {
            console.error('IndexedDB failed to initialize:', error);
            this.showNotification('Running in memory-only mode. Your data will not be saved.', 'error');
        }
        
        // Load settings and data
        await this.loadSettings();
        await this.loadTasks();
        await this.loadSessions();
        
        // Initialize theme
        this.initTheme();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Check if new day (reset session counter)
        this.checkDailyReset();

        // Request Desktop Notifications
        if (this.settings.desktopNotification && Notification.permission !== 'granted') {
            Notification.requestPermission();
        }
        
        // Update UI
        this.updateTimerDisplay();
        this.renderTasks();
        this.generateAnalytics();
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('DopamineRushDB', 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('tasks')) {
                    db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
                }
                
                if (!db.objectStoreNames.contains('sessions')) {
                    db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
                }
                
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings');
                }
            };
        });
    }

    // ====================================
    // TIMER FUNCTIONS
    // ====================================

    startTimer() {
        if (this.isRunning) return;

        // Unlock iOS AudioContext
        if (!this.audioContextUnlocked) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            gain.gain.value = 0;
            osc.start();
            osc.stop(this.audioContext.currentTime + 0.01);
            this.audioContextUnlocked = true;
        }

        // Clear blinking title
        if (this.titleInterval) {
            clearInterval(this.titleInterval);
            this.titleInterval = null;
        }

        this.isRunning = true;
        
        if (!this.currentSessionStartTime) {
            this.currentSessionStartTime = Date.now();
        } else if (this.pauseStartTime) {
            this.currentSessionStartTime += (Date.now() - this.pauseStartTime);
            this.pauseStartTime = null;
        }
        
        if (this.timeRemaining === 0) {
            this.timeRemaining = this.settings.workDuration * 60;
        }

        this.endTime = Date.now() + (this.timeRemaining * 1000);

        document.getElementById('startBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;

        this.timer = setInterval(() => {
            this.timeRemaining = Math.max(0, Math.round((this.endTime - Date.now()) / 1000));

            if (this.timeRemaining <= 0) {
                this.completeSession();
            } else {
                this.updateTimerDisplay();
            }
        }, 100);
    }

    pauseTimer() {
        if (!this.isRunning) return;

        this.isRunning = false;
        clearInterval(this.timer);
        this.pauseStartTime = Date.now();

        document.getElementById('startBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
        this.updateTimerDisplay();
    }

    resetTimer(manual = false) {
        this.isRunning = false;
        clearInterval(this.timer);
        
        if (this.titleInterval) {
            clearInterval(this.titleInterval);
            this.titleInterval = null;
        }

        if (manual) {
            this.currentSessionStartTime = null;
            this.pauseStartTime = null;
        }

        if (this.isWorkSession) {
            this.timeRemaining = this.settings.workDuration * 60;
        } else {
            const isLongBreak = this.sessionsCompletedToday > 0 && this.sessionsCompletedToday % this.settings.sessionsUntilLongBreak === 0;
            this.timeRemaining = isLongBreak ? this.settings.longBreakDuration * 60 : this.settings.breakDuration * 60;
        }

        document.getElementById('startBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;

        this.updateTimerDisplay();
    }
    
    skipPhase() {
        if (this.titleInterval) {
            clearInterval(this.titleInterval);
            this.titleInterval = null;
        }
        this.completeSession();
    }

    completeSession() {
        if (this.isCompleting) return;
        this.isCompleting = true;
        
        this.isRunning = false;
        clearInterval(this.timer);
        
        const duration = this.isWorkSession ? this.settings.workDuration : 
                       (this.sessionsCompletedToday > 0 && this.sessionsCompletedToday % this.settings.sessionsUntilLongBreak === 0 ? 
                        this.settings.longBreakDuration : this.settings.breakDuration);

        if (this.isWorkSession) {
            this.sessionsCompletedToday++;
            this.saveSession({
                type: 'work',
                duration: duration,
                timestamp: new Date().toISOString(),
                startTime: this.currentSessionStartTime || Date.now()
            });
            this.showNotification('Great work! Take a break. 🎉', 'success');
            if (this.settings.desktopNotification && Notification.permission === 'granted') {
                new Notification('Dopamine Rush', { body: 'Great work! Take a break. 🎉', icon: 'favicon.svg' });
            }
        } else {
            this.showNotification('Break complete! Ready to focus? 🚀', 'success');
            if (this.settings.desktopNotification && Notification.permission === 'granted') {
                new Notification('Dopamine Rush', { body: 'Break complete! Ready to focus? 🚀', icon: 'favicon.svg' });
            }
        }

        this.playSound();
        this.vibrate();
        
        let flashTitle = true;
        this.titleInterval = setInterval(() => {
            document.title = flashTitle ? "🔔 Time's Up!" : "Dopamine Rush";
            flashTitle = !flashTitle;
        }, 1000);

        // Switch session type
        this.isWorkSession = !this.isWorkSession;
        this.currentSessionStartTime = null;
        this.pauseStartTime = null;
        this.resetTimer();
        
        // Update UI
        document.getElementById('sessionCount').textContent = this.sessionsCompletedToday;
        this.renderTasks();
        this.generateAnalytics();

        // Handle auto-start
        if (this.isWorkSession && this.settings.autoStartPomodoros) {
            setTimeout(() => this.startTimer(), 1500);
        } else if (!this.isWorkSession && this.settings.autoStartBreaks) {
            setTimeout(() => this.startTimer(), 1500);
        }
        
        this.isCompleting = false;
    }

    updateTimerDisplay() {
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = this.timeRemaining % 60;
        const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        document.getElementById('timeDisplay').textContent = display;
        
        let sessionMode = 'Work Session';
        if (!this.isWorkSession) {
            sessionMode = (this.sessionsCompletedToday > 0 && this.sessionsCompletedToday % this.settings.sessionsUntilLongBreak === 0) 
                ? 'Long Break' : 'Short Break';
        }
        document.getElementById('sessionInfo').textContent = sessionMode;

        // Update page title if not blinking
        if (!this.titleInterval) {
            document.title = this.isRunning ? `${display} - Dopamine Rush` : `(Paused) ${display} - Dopamine Rush`;
            if (this.timeRemaining === (this.isWorkSession ? this.settings.workDuration * 60 : (sessionMode === 'Long Break' ? this.settings.longBreakDuration * 60 : this.settings.breakDuration * 60)) && !this.isRunning) {
                document.title = `Dopamine Rush - Productivity Tracker`;
            }
        }

        // Update progress ring
        const totalSeconds = this.isWorkSession ? 
            this.settings.workDuration * 60 : 
            (this.sessionsCompletedToday > 0 && this.sessionsCompletedToday % this.settings.sessionsUntilLongBreak === 0 ?
             this.settings.longBreakDuration * 60 :
             this.settings.breakDuration * 60);
        
        const progress = ((totalSeconds - this.timeRemaining) / totalSeconds) * 339.292;
        const ring = document.querySelector('.progress-fill');
        if (ring) {
            ring.style.strokeDasharray = '339.292';
            ring.style.strokeDashoffset = (339.292 - progress).toString();
        }
        
        // Update sessions until long break display
        const remain = this.settings.sessionsUntilLongBreak - (this.sessionsCompletedToday % this.settings.sessionsUntilLongBreak);
        document.getElementById('sessionsUntilLongBreakDisplay').textContent = `${remain} session${remain===1?'':'s'} until long break`;
    }

    playSound() {
        if (!this.settings.soundEnabled) return;
        
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        const vol = (this.settings.volume || 30) / 100;

        gainNode.gain.setValueAtTime(vol, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.5);
    }

    vibrate() {
        if (!this.settings.vibrationEnabled || !navigator.vibrate) return;
        navigator.vibrate([100, 50, 100]);
    }

    // ====================================
    // TASK FUNCTIONS
    // ====================================

    async loadTasks() {
        if (!this.db) return;
        const store = this.db.transaction('tasks').objectStore('tasks');
        return new Promise((resolve) => {
            const request = store.getAll();
            request.onsuccess = () => {
                this.tasks = request.result.sort((a, b) => {
                    const priorityOrder = { high: 0, medium: 1, low: 2 };
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                });
                resolve();
            };
        });
    }

    async saveTask(task) {
        if (!this.db) {
            // Memory fallback
            const existingIndex = this.tasks.findIndex(t => t.id === task.id);
            if (existingIndex > -1) {
                this.tasks[existingIndex] = task;
            } else {
                task.id = Date.now();
                this.tasks.push(task);
            }
            this.renderTasks();
            return Promise.resolve();
        }
        
        const store = this.db.transaction('tasks', 'readwrite').objectStore('tasks');
        return new Promise((resolve) => {
            const request = task.id ? store.put(task) : store.add(task);
            request.onsuccess = () => {
                resolve();
                this.loadTasks().then(() => this.renderTasks());
            };
        });
    }

    async deleteTask(id, skipRender = false) {
        if (!this.db) {
            this.tasks = this.tasks.filter(t => t.id !== id);
            if (!skipRender) this.renderTasks();
            return Promise.resolve();
        }
        const store = this.db.transaction('tasks', 'readwrite').objectStore('tasks');
        return new Promise((resolve) => {
            const request = store.delete(id);
            request.onsuccess = () => {
                resolve();
                if (!skipRender) this.loadTasks().then(() => this.renderTasks());
            };
        });
    }
    
    async purgeCompletedTasks() {
        if (!confirm('Are you sure you want to permanently delete all completed tasks?')) return;
        const completed = this.tasks.filter(t => t.completed);
        for (const task of completed) {
            await this.deleteTask(task.id, true);
        }
        await this.loadTasks();
        this.renderTasks();
        this.showNotification('Completed tasks purged', 'success');
    }

    addTask() {
        const form = document.getElementById('addTaskForm');
        form.hidden = !form.hidden;
        if (!form.hidden) {
            document.getElementById('taskInput').focus();
        }
    }

    saveNewTask(e) {
        if (e) e.preventDefault();
        
        const title = document.getElementById('taskInput').value.trim();
        const priority = document.getElementById('prioritySelect').value;
        let estimate = parseInt(document.getElementById('estimateInput').value) || 1;
        estimate = Math.min(10, Math.max(1, estimate)); // Clamp between 1-10

        if (!title) {
            this.showNotification('Please enter a task', 'error');
            return;
        }

        const task = {
            title,
            priority,
            estimate,
            completed: false,
            createdAt: new Date().toISOString(),
            completedAt: null,
            pomodoros: 0
        };

        this.saveTask(task);
        document.getElementById('taskInput').value = '';
        document.getElementById('prioritySelect').value = 'medium';
        document.getElementById('estimateInput').value = '1';
        document.getElementById('addTaskForm').hidden = true;
        this.showNotification('Task added! 🎯', 'success');
    }

    hideTaskForm() {
        document.getElementById('addTaskForm').hidden = true;
    }

    completeTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.completed = true;
            task.completedAt = new Date().toISOString();
            task.pomodoros = this.sessionsCompletedToday;
            this.saveTask(task);
            this.showNotification(`Task completed! 🎉 +${task.estimate * 10} dopamine`, 'success');
        }
    }

    renderTasks() {
        const tasksList = document.getElementById('tasksList');
        const completedTasksList = document.getElementById('completedTasksList');
        const emptyState = document.getElementById('emptyState');

        const activeTasks = this.tasks.filter(t => !t.completed);
        const completedTasks = this.tasks.filter(t => t.completed);

        if (activeTasks.length === 0) {
            tasksList.innerHTML = '';
            emptyState.hidden = false;
        } else {
            emptyState.hidden = true;
            tasksList.innerHTML = activeTasks.map(task => `
                <div class="task-item">
                    <input 
                        type="checkbox" 
                        class="task-checkbox"
                        onchange="app.completeTask(${task.id})"
                    >
                    <div class="task-content">
                        <div class="task-title">${this.escapeHtml(task.title)}</div>
                        <div class="task-meta">
                            <span class="task-priority-badge task-priority-${task.priority}">Priority</span>
                            <span>⏱️ ${task.estimate} pomo</span>
                            <span>📅 ${new Date(task.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <button class="task-btn" onclick="if(confirm('Delete this task?')) app.deleteTask(${task.id})">Delete</button>
                </div>
            `).join('');
        }
        
        if (completedTasks.length === 0) {
            completedTasksList.innerHTML = '<p style="color: var(--color-text-secondary); text-align: center;">No completed tasks yet.</p>';
        } else {
            completedTasksList.innerHTML = completedTasks.map(task => `
                <div class="task-item" style="opacity: 0.6;">
                    <div class="task-content">
                        <div class="task-title" style="text-decoration: line-through;">${this.escapeHtml(task.title)}</div>
                        <div class="task-meta">
                            <span>⏱️ Finished in ${task.pomodoros} sessions</span>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }

    // ====================================
    // SESSION & ANALYTICS FUNCTIONS
    // ====================================

    async saveSession(session) {
        if (!this.db) {
            session.id = Date.now();
            this.sessions.push(session);
            return Promise.resolve();
        }
        const store = this.db.transaction('sessions', 'readwrite').objectStore('sessions');
        return new Promise((resolve) => {
            const request = store.add(session);
            request.onsuccess = () => resolve();
        });
    }

    async loadSessions() {
        if (!this.db) return;
        const store = this.db.transaction('sessions').objectStore('sessions');
        return new Promise((resolve) => {
            const request = store.getAll();
            request.onsuccess = () => {
                this.sessions = request.result;
                resolve();
            };
        });
    }

    generateAnalytics() {
        const today = new Date().toDateString();
        
        this.updateAnalytics({
            totalPomodoros: this.sessions.filter(s => s.type === 'work').length,
            totalHours: (this.sessions.filter(s => s.type === 'work').reduce((acc, s) => acc + s.duration, 0) / 60).toFixed(1),
            currentStreak: this.calculateStreak(),
            completionRate: this.calculateCompletionRate(),
            weeklyData: this.getWeeklyData(),
            priorityBreakdown: this.getPriorityBreakdown(),
            insights: this.generateInsights()
        });
    }

    calculateStreak() {
        const dates = [...new Set(this.sessions.map(s => new Date(s.timestamp).toDateString()))];
        let streak = 0;
        let currentDate = new Date();

        while (true) {
            const dateStr = currentDate.toDateString();
            if (dates.includes(dateStr)) {
                streak++;
                currentDate.setDate(currentDate.getDate() - 1);
            } else {
                break;
            }
        }

        return streak;
    }

    calculateCompletionRate() {
        if (this.tasks.length === 0) return 0;
        const completed = this.tasks.filter(t => t.completed).length;
        return Math.round((completed / this.tasks.length) * 100);
    }

    getWeeklyData() {
        const data = {};
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toLocaleDateString('en-US', { weekday: 'short' });
            const count = this.sessions.filter(s => 
                new Date(s.timestamp).toDateString() === date.toDateString() && s.type === 'work'
            ).length;
            data[dateStr] = count;
        }
        return data;
    }

    getPriorityBreakdown() {
        return {
            high: this.tasks.filter(t => t.priority === 'high').length,
            medium: this.tasks.filter(t => t.priority === 'medium').length,
            low: this.tasks.filter(t => t.priority === 'low').length
        };
    }

    generateInsights() {
        const insights = [];

        if (this.sessionsCompletedToday >= 8) {
            insights.push({
                title: 'Beast Mode Activated 🔥',
                description: `You've completed ${this.sessionsCompletedToday} sessions today. You're in the zone!`
            });
        } else if (this.sessionsCompletedToday >= 4) {
            insights.push({
                title: 'Great Pace 💪',
                description: `You're maintaining a solid ${this.sessionsCompletedToday} sessions today.`
            });
        }

        const streak = this.calculateStreak();
        if (streak > 7) {
            insights.push({
                title: 'Consistency Champion 🏆',
                description: `${streak} day streak! You're building unstoppable habits.`
            });
        }

        const completion = this.calculateCompletionRate();
        if (completion === 100 && this.tasks.length > 0) {
            insights.push({
                title: 'Perfect Day 🌟',
                description: 'You completed all your tasks today. Incredible focus!'
            });
        }

        if (insights.length === 0) {
            insights.push({
                title: 'Start Your Journey 🚀',
                description: 'Begin a session and complete your first task to unlock insights.'
            });
        }

        return insights;
    }

    updateAnalytics(data) {
        document.getElementById('totalPomodoros').textContent = data.totalPomodoros;
        document.getElementById('totalHours').textContent = data.totalHours;
        document.getElementById('currentStreak').textContent = data.currentStreak;
        document.getElementById('completionRate').textContent = data.completionRate;

        this.renderWeeklyChart(data.weeklyData);
        this.renderPriorityBreakdown(data.priorityBreakdown);
        this.renderInsights(data.insights);
    }

    renderWeeklyChart(data) {
        const chart = document.getElementById('weeklyChart');
        const max = Math.max(...Object.values(data), 5); // baseline scale

        chart.innerHTML = Object.entries(data).map(([day, count]) => {
            const height = (count / max) * 100;
            return `
                <div class="bar" style="height: ${height}%">
                    <div class="bar-value">${count}</div>
                    <div class="bar-label">${day}</div>
                </div>
            `;
        }).join('');
    }

    renderPriorityBreakdown(data) {
        const container = document.getElementById('priorityBreakdown');
        container.innerHTML = `
            <div class="priority-item high">
                <div style="flex: 1;">
                    <div class="priority-label">
                        <span class="priority-name">🔴 High</span>
                        <span class="priority-count">${data.high} tasks</span>
                    </div>
                </div>
            </div>
            <div class="priority-item medium">
                <div style="flex: 1;">
                    <div class="priority-label">
                        <span class="priority-name">🟡 Medium</span>
                        <span class="priority-count">${data.medium} tasks</span>
                    </div>
                </div>
            </div>
            <div class="priority-item low">
                <div style="flex: 1;">
                    <div class="priority-label">
                        <span class="priority-name">🟢 Low</span>
                        <span class="priority-count">${data.low} tasks</span>
                    </div>
                </div>
            </div>
        `;
    }

    renderInsights(insights) {
        const container = document.getElementById('insightsList');
        container.innerHTML = insights.map(insight => `
            <div class="insight-item">
                <div class="insight-title">${insight.title}</div>
                <div>${insight.description}</div>
            </div>
        `).join('');
    }

    // ====================================
    // SETTINGS FUNCTIONS
    // ====================================

    async loadSettings() {
        if (!this.db) {
            this.applySettingsToUI();
            return Promise.resolve();
        }
        const store = this.db.transaction('settings').objectStore('settings');
        return new Promise((resolve) => {
            const request = store.get('preferences');
            request.onsuccess = () => {
                if (request.result) {
                    this.settings = { ...this.settings, ...request.result };
                }
                this.applySettingsToUI();
                resolve();
            };
        });
    }

    async saveSettings() {
        if (!this.db) return Promise.resolve();
        const store = this.db.transaction('settings', 'readwrite').objectStore('settings');
        return new Promise((resolve) => {
            const request = store.put(this.settings, 'preferences');
            request.onsuccess = () => resolve();
        });
    }

    updateSettings(e) {
        const oldWork = this.settings.workDuration;
        const oldBreak = this.settings.breakDuration;
        const oldLongBreak = this.settings.longBreakDuration;
        
        this.settings.workDuration = parseInt(document.getElementById('workDuration').value);
        this.settings.breakDuration = parseInt(document.getElementById('breakDuration').value);
        this.settings.longBreakDuration = parseInt(document.getElementById('longBreakDuration').value);
        this.settings.sessionsUntilLongBreak = parseInt(document.getElementById('sessionsUntilLongBreak').value);
        
        this.settings.autoStartBreaks = document.getElementById('autoStartBreaks').checked;
        this.settings.autoStartPomodoros = document.getElementById('autoStartPomodoros').checked;
        this.settings.soundEnabled = document.getElementById('soundToggle').checked;
        this.settings.volume = parseInt(document.getElementById('volumeSlider').value);
        this.settings.vibrationEnabled = document.getElementById('vibrationToggle').checked;
        this.settings.desktopNotification = document.getElementById('desktopNotificationToggle').checked;

        this.saveSettings();
        
        // Only reset timer if actual durations changed
        if (oldWork !== this.settings.workDuration || oldBreak !== this.settings.breakDuration || oldLongBreak !== this.settings.longBreakDuration) {
            this.resetTimer(true);
        }

        if (this.settings.desktopNotification && Notification.permission !== 'granted') {
            Notification.requestPermission();
        }

        this.showNotification('Settings saved! ✅', 'success');
    }

    applySettingsToUI() {
        document.getElementById('workDuration').value = this.settings.workDuration;
        document.getElementById('breakDuration').value = this.settings.breakDuration;
        document.getElementById('longBreakDuration').value = this.settings.longBreakDuration;
        document.getElementById('sessionsUntilLongBreak').value = this.settings.sessionsUntilLongBreak;
        
        document.getElementById('autoStartBreaks').checked = this.settings.autoStartBreaks;
        document.getElementById('autoStartPomodoros').checked = this.settings.autoStartPomodoros;
        document.getElementById('soundToggle').checked = this.settings.soundEnabled;
        document.getElementById('volumeSlider').value = this.settings.volume;
        document.getElementById('vibrationToggle').checked = this.settings.vibrationEnabled;
        document.getElementById('desktopNotificationToggle').checked = this.settings.desktopNotification;
    }

    // ====================================
    // THEME FUNCTIONS
    // ====================================

    initTheme() {
        const saved = localStorage.getItem('dopamine-theme');
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = saved || (dark ? 'dark' : 'light');

        this.setTheme(theme);
        this.updateThemeIcon(theme);
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('dopamine-theme', theme);
        this.updateThemeIcon(theme);
        
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', theme === 'dark' ? '#0f0f0f' : '#ffffff');
        }
    }

    toggleTheme() {
        const current = localStorage.getItem('dopamine-theme') || 'light';
        const next = current === 'light' ? 'dark' : 'light';
        this.setTheme(next);
    }

    updateThemeIcon(theme) {
        const btn = document.getElementById('themeToggle');
        btn.textContent = theme === 'light' ? '🌙' : '☀️';
    }

    // ====================================
    // DATA EXPORT/IMPORT
    // ====================================

    exportData() {
        const data = {
            tasks: this.tasks,
            sessions: this.sessions,
            settings: this.settings,
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const tzoffset = (new Date()).getTimezoneOffset() * 60000;
        const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1);
        
        a.download = `dopamine-rush-${localISOTime.split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.showNotification('Data exported! 📥', 'success');
    }

    importData() {
        document.getElementById('importFile').click();
    }

    async handleImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                if (!this.db) {
                    this.showNotification('Cannot import in memory-only mode', 'error');
                    return;
                }

                // Import tasks
                for (const task of data.tasks || []) {
                    await this.saveTask(task);
                }

                // Import sessions
                const sessionsStore = this.db.transaction('sessions', 'readwrite').objectStore('sessions');
                for (const session of data.sessions || []) {
                    sessionsStore.add(session);
                }

                this.showNotification('Data imported successfully! 📤', 'success');
                setTimeout(() => location.reload(), 1000);
            } catch (error) {
                this.showNotification('Invalid file format', 'error');
            }
        };
        reader.readAsText(file);
    }

    clearAllData() {
        if (!confirm('Are you sure? This will delete all tasks and session data.')) return;
        
        if (this.db) {
            const tasksStore = this.db.transaction('tasks', 'readwrite').objectStore('tasks');
            const sessionsStore = this.db.transaction('sessions', 'readwrite').objectStore('sessions');
            tasksStore.clear();
            sessionsStore.clear();
        }

        this.tasks = [];
        this.sessions = [];
        this.sessionsCompletedToday = 0;

        this.renderTasks();
        this.generateAnalytics();
        this.showNotification('All data cleared', 'success');
    }

    // ====================================
    // UTILITY FUNCTIONS
    // ====================================

    showNotification(message, type = 'default') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `notification-toast ${type}`;
        toast.hidden = false;

        setTimeout(() => {
            toast.hidden = true;
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    checkDailyReset() {
        const lastDate = localStorage.getItem('dopamine-last-date');
        const today = new Date().toDateString();

        if (lastDate !== today) {
            this.sessionsCompletedToday = 0;
            localStorage.setItem('dopamine-last-date', today);
            document.getElementById('sessionCount').textContent = '0';
            this.updateTimerDisplay(); // Refresh UI in case they were on break
        } else {
            document.getElementById('sessionCount').textContent = this.sessionsCompletedToday;
        }
    }

    // ====================================
    // EVENT LISTENERS
    // ====================================

    setupEventListeners() {
        // Timer controls
        document.getElementById('startBtn').addEventListener('click', () => this.startTimer());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pauseTimer());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetTimer(true));
        document.getElementById('skipBtn').addEventListener('click', () => this.skipPhase());

        // Task management
        document.getElementById('addTaskBtn').addEventListener('click', () => this.addTask());
        document.getElementById('addTaskForm').addEventListener('submit', (e) => this.saveNewTask(e));
        document.getElementById('cancelTaskBtn').addEventListener('click', () => this.hideTaskForm());
        document.getElementById('toggleCompletedBtn').addEventListener('click', (e) => {
            const list = document.getElementById('completedTasksList');
            list.hidden = !list.hidden;
            e.target.textContent = list.hidden ? 'Show' : 'Hide';
        });

        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                const view = e.target.dataset.view;
                document.querySelectorAll('.tab-content').forEach(section => {
                    section.classList.remove('active');
                });
                document.getElementById(`${view}View`).classList.add('active');

                if (view === 'analytics') {
                    this.generateAnalytics();
                }
            });
        });

        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());

        // Settings
        document.getElementById('workDuration').addEventListener('change', (e) => this.updateSettings(e));
        document.getElementById('breakDuration').addEventListener('change', (e) => this.updateSettings(e));
        document.getElementById('longBreakDuration').addEventListener('change', (e) => this.updateSettings(e));
        document.getElementById('sessionsUntilLongBreak').addEventListener('change', (e) => this.updateSettings(e));
        document.getElementById('autoStartBreaks').addEventListener('change', (e) => this.updateSettings(e));
        document.getElementById('autoStartPomodoros').addEventListener('change', (e) => this.updateSettings(e));
        document.getElementById('soundToggle').addEventListener('change', (e) => this.updateSettings(e));
        document.getElementById('volumeSlider').addEventListener('change', (e) => this.updateSettings(e));
        document.getElementById('vibrationToggle').addEventListener('change', (e) => this.updateSettings(e));
        document.getElementById('desktopNotificationToggle').addEventListener('change', (e) => this.updateSettings(e));

        // Data management
        document.getElementById('exportDataBtn').addEventListener('click', () => this.exportData());
        document.getElementById('importDataBtn').addEventListener('click', () => this.importData());
        document.getElementById('importFile').addEventListener('change', (e) => this.handleImport(e));
        document.getElementById('purgeCompletedBtn').addEventListener('click', () => this.purgeCompletedTasks());
        document.getElementById('clearDataBtn').addEventListener('click', () => this.clearAllData());
        
        // Visibility API for day rollovers in background tab
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkDailyReset();
            }
        });
    }
}

// Initialize app
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DopamineRush();
});

// Prevent accidental navigation
window.addEventListener('beforeunload', (e) => {
    if (app && app.isRunning) {
        e.preventDefault();
        e.returnValue = '';
    }
});
