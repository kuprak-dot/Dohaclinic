import React, { useState, useEffect } from 'react';
import { Calendar, FileText, Bell, Clock, MapPin, Sun, Edit3, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { spanishWords } from './spanishWords';
import { parseScheduleFile, generateICS } from './utils/parser';
import { saveAs } from 'file-saver';

function App() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('dailyNotes');
    return saved ? JSON.parse(saved) : {};
  });

  // Manual duty entry state
  const [manualDuties, setManualDuties] = useState(() => {
    const saved = localStorage.getItem('manualDuties');
    return saved ? JSON.parse(saved) : [];
  });
  const [showAddDutyModal, setShowAddDutyModal] = useState(false);
  const [newDuty, setNewDuty] = useState({
    day: '',
    location: 'Room 201',
    time: '08:00 - 15:00'
  });

  // File Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState('');
  const [parsedEvents, setParsedEvents] = useState(null);

  useEffect(() => {
    // Fetch schedule data
    fetch('/schedule.json')
      .then(res => res.json())
      .then(data => {
        setScheduleData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading schedule:", err);
        setLoading(false);
      });

    // Fetch weather for Doha
    fetch('https://wttr.in/Doha?format=j1')
      .then(res => res.json())
      .then(data => {
        setWeather({
          temp: data.current_condition[0].temp_C,
          condition: data.current_condition[0].weatherDesc[0].value
        });
      })
      .catch(err => console.error("Weather fetch failed:", err));
  }, []);

  useEffect(() => {
    localStorage.setItem('dailyNotes', JSON.stringify(notes));
  }, [notes]);

  // Save manual duties to localStorage
  useEffect(() => {
    localStorage.setItem('manualDuties', JSON.stringify(manualDuties));
  }, [manualDuties]);

  const handleNoteChange = (day, value) => {
    setNotes(prev => ({
      ...prev,
      [day]: value
    }));
  };

  // Get time options based on location
  const getTimeOptions = (location) => {
    switch (location) {
      case 'Room 201':
        return ['08:00 - 15:00', '15:00 - 22:00'];
      case 'Room 214':
        return ['12:00 - 19:00'];
      case 'Abu Sidra':
        return ['13:00 - 21:00'];
      case 'Cuma Nöbet':
        return ['24h'];
      case 'On Call':
        return ['24h'];
      default:
        return ['08:00 - 15:00'];
    }
  };

  // Handle location change - auto-set time
  const handleLocationChange = (location) => {
    const times = getTimeOptions(location);
    setNewDuty(prev => ({
      ...prev,
      location,
      time: times[0]
    }));
  };

  // Add manual duty
  const handleAddDuty = () => {
    if (!newDuty.day) return;

    const duty = {
      day: parseInt(newDuty.day),
      location: newDuty.location,
      time: newDuty.time,
      isManual: true
    };

    setManualDuties(prev => [...prev, duty]);
    setNewDuty({ day: '', location: 'Room 201', time: '08:00 - 15:00' });
    setShowAddDutyModal(false);
  };

  // Remove manual duty
  const handleRemoveDuty = (day, location) => {
    setManualDuties(prev => prev.filter(d => !(d.day === day && d.location === location)));
  };

  // Get today's assignments (including manual duties)
  const getTodaySchedule = () => {
    const today = new Date();
    const dayOfMonth = today.getDate();

    // Get from schedule.json
    const jsonData = scheduleData?.schedule?.find(d => d.day === dayOfMonth);
    const jsonAssignments = jsonData?.assignments || [];

    // Get manual duties for today
    const manualToday = manualDuties
      .filter(d => d.day === dayOfMonth)
      .map(d => ({ location: d.location, time: d.time, isManual: true }));

    return [...jsonAssignments, ...manualToday];
  };

  // Get upcoming assignments (next 7 days, EXCLUDING today) - merged with manual duties
  const getUpcomingSchedule = () => {
    const today = new Date();
    const dayOfMonth = today.getDate();

    // Create a map of all days with assignments
    const dayMap = new Map();

    // Add schedule.json data
    if (scheduleData?.schedule) {
      scheduleData.schedule
        .filter(d => d.day > dayOfMonth)
        .forEach(d => {
          dayMap.set(d.day, {
            day: d.day,
            dayName: d.dayName || '',
            assignments: d.assignments.map(a => ({ ...a, isManual: false }))
          });
        });
    }

    // Merge manual duties
    manualDuties
      .filter(d => d.day > dayOfMonth)
      .forEach(duty => {
        if (dayMap.has(duty.day)) {
          dayMap.get(duty.day).assignments.push({
            location: duty.location,
            time: duty.time,
            isManual: true
          });
        } else {
          dayMap.set(duty.day, {
            day: duty.day,
            dayName: '',
            assignments: [{
              location: duty.location,
              time: duty.time,
              isManual: true
            }]
          });
        }
      });

    // Convert to array and sort by day
    return Array.from(dayMap.values())
      .sort((a, b) => a.day - b.day)
      .slice(0, 10);
  };

  const todayAssignments = getTodaySchedule();
  const allUpcomingDays = getUpcomingSchedule();
  const upcomingDays = showAllUpcoming ? allUpcomingDays : allUpcomingDays.slice(0, 4);
  const currentDay = new Date().getDate();

  // Spanish Word of the Day Logic
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
  const dailyWord = spanishWords[dayOfYear % spanishWords.length];

  const getLocationColor = (location) => {
    if (location.includes('Room 201')) return { bg: '#fef9c3', text: '#713f12', border: '#fde047' };
    if (location.includes('Room 214')) return { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' };
    if (location.includes('Cuma Nöbet')) return { bg: '#f3e8ff', text: '#581c87', border: '#d8b4fe' };
    if (location.includes('On Call')) return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' };
    if (location.includes('Abu Sidra')) return { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' };
    return { bg: '#f1f5f9', text: '#1e293b', border: '#cbd5e1' };
  };

  const getNotePlaceholder = (assignments) => {
    if (!assignments || assignments.length === 0) return 'Not ekle...';

    // Check if all assignments are PM (after 12:00)
    const allPm = assignments.every(a => {
      const hour = parseInt(a.time.split(':')[0]);
      return hour >= 12;
    });

    if (allPm) return 'Sabah planları...';

    // Check if all assignments are AM (before 12:00)
    const allAm = assignments.every(a => {
      const hour = parseInt(a.time.split(':')[0]);
      return hour < 12;
    });

    if (allAm) return 'Öğleden sonra planları...';

    return 'Not ekle...';
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    setProcessStatus('Analiz ediliyor (Bu işlem birkaç saniye sürebilir)...');
    setParsedEvents(null);

    try {
      const schedule = await parseScheduleFile(file, "Tevfik");
      setParsedEvents(schedule);
      setProcessStatus(`Başarılı! ${schedule.length} gün bulundu.`);
    } catch (error) {
      console.error(error);
      setProcessStatus('Hata: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddToCalendar = () => {
    if (!parsedEvents) return;
    const icsContent = generateICS(parsedEvents);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    saveAs(blob, 'doha_clinic_schedule.ics');
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans text-base">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 px-3 py-2 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-lg">
              DC
            </div>
            <h1 className="font-bold text-slate-800 text-xl">Doha Clinic</h1>
          </div>

          <div className="flex items-center gap-3">
            {weather && (
              <div className="flex items-center gap-1.5 text-slate-600">
                <Sun size={20} className="text-amber-500" />
                <span className="font-semibold text-lg">{weather.temp}°C</span>
              </div>
            )}
            <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full">
              <Bell size={24} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-2 max-w-md mx-auto space-y-2">
        {activeTab === 'schedule' && (
          <div className="space-y-2">
            {/* Today's Schedule */}
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 mb-0.5">Merhaba, Dr. Tevfik</h2>
              <p className="text-slate-500 text-base mb-2">Bugünkü programınız</p>

              {loading ? (
                <div className="p-3 bg-slate-50 rounded-lg animate-pulse h-20"></div>
              ) : todayAssignments.length > 0 ? (
                <div className="space-y-2">
                  {todayAssignments.map((assignment, idx) => {
                    const colors = getLocationColor(assignment.location);
                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-lg border flex items-center gap-3"
                        style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
                      >
                        <MapPin size={20} />
                        <div className="flex-1">
                          <span className="font-bold text-xl">{assignment.location}</span>
                          <div className="flex items-center gap-1 opacity-90 mt-0.5 text-base font-medium">
                            <Clock size={16} />
                            <span>{assignment.time}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 bg-blue-50 text-blue-800 rounded-lg border border-blue-100 flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                  <span className="font-semibold text-lg">Bugün görev yok ✨</span>
                </div>
              )}
            </div>

            {/* Upcoming Schedule */}
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="font-bold text-slate-700 text-lg">Yaklaşan Görevler</h3>
                <button
                  onClick={() => setShowAddDutyModal(true)}
                  className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center hover:bg-sky-600 transition-colors shadow-sm"
                >
                  <Plus size={20} />
                </button>
              </div>
              <div className="space-y-2">
                {loading ? (
                  <>
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 animate-pulse h-24"></div>
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 animate-pulse h-24"></div>
                  </>
                ) : upcomingDays.length > 0 ? (
                  <>
                    {upcomingDays.map((day) => {
                      const placeholder = getNotePlaceholder(day.assignments);
                      // Calculate day name for December 2025
                      const date = new Date(2025, 11, day.day);
                      const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
                      const dayName = dayNames[date.getDay()];

                      return (
                        <div
                          key={day.day}
                          className="p-3 rounded-xl shadow-sm border bg-white border-slate-100"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg text-center min-w-[3.8rem] bg-slate-100">
                              <span className="block text-xs uppercase font-bold mb-0.5 text-slate-500">
                                {dayName}
                              </span>
                              <span className="block text-2xl font-bold text-slate-800">
                                {day.day}
                              </span>
                            </div>
                            <div className="flex-1 space-y-2">
                              {day.assignments && day.assignments.length > 0 ? (
                                day.assignments.map((assignment, idx) => {
                                  const colors = getLocationColor(assignment.location);
                                  return (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between p-2 rounded-lg border"
                                      style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                                    >
                                      <div className="flex items-center gap-2">
                                        <MapPin size={18} style={{ color: colors.text }} />
                                        <span className="font-semibold text-lg" style={{ color: colors.text }}>
                                          {assignment.location}
                                        </span>
                                        {assignment.isManual && (
                                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Manuel</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium" style={{ color: colors.text }}>
                                          {assignment.time}
                                        </span>
                                        {assignment.isManual && (
                                          <button
                                            onClick={() => handleRemoveDuty(day.day, assignment.location)}
                                            className="w-5 h-5 bg-red-100 text-red-500 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors"
                                          >
                                            <X size={14} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <span className="text-sm text-slate-400 font-medium">
                                  Görev yok
                                </span>
                              )}

                              {/* Daily Note Input - No Label */}
                              <div className="mt-1 pt-2 border-t border-slate-100">
                                <div className="flex items-center gap-2">
                                  <Edit3 size={16} className="text-slate-400" />
                                  <input
                                    type="text"
                                    value={notes[day.day] || ''}
                                    onChange={(e) => handleNoteChange(day.day, e.target.value)}
                                    placeholder={placeholder}
                                    className="w-full text-base bg-transparent border-none focus:ring-0 p-0 italic text-[#6b1225] placeholder:text-[#b95b75]"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Show More / Less Button */}
                    {allUpcomingDays.length > 4 && (
                      <button
                        onClick={() => setShowAllUpcoming(!showAllUpcoming)}
                        className="w-full py-2 flex items-center justify-center gap-2 text-slate-500 hover:text-primary hover:bg-slate-50 rounded-lg transition-colors font-medium text-sm"
                      >
                        {showAllUpcoming ? (
                          <>
                            <ChevronUp size={18} />
                            Daha Az Göster
                          </>
                        ) : (
                          <>
                            <ChevronDown size={18} />
                            Daha Fazla Göster ({allUpcomingDays.length - 4})
                          </>
                        )}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-slate-400 bg-white rounded-xl border border-slate-100">
                    <Calendar size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-base">Yaklaşan görev yok</p>
                  </div>
                )}
              </div>
            </div>

            {/* Spanish Word of the Day */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-xl border border-orange-100 mt-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🇪🇸</span>
                <h3 className="font-bold text-orange-900 text-lg">Günün İspanyolca Kelimesi</h3>
              </div>
              <div className="mb-2">
                <span className="text-3xl font-bold text-slate-800 block mb-1">{dailyWord.word}</span>
                <span className="text-base text-slate-600 italic font-medium">{dailyWord.meaning}</span>
              </div>
              <div className="bg-white bg-opacity-60 p-3 rounded-lg border border-orange-100">
                <p className="text-base text-slate-800 font-medium mb-1">"{dailyWord.sentence}"</p>
                <p className="text-sm text-slate-500 italic">"{dailyWord.sentence_en}"</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="flex flex-col items-center justify-start min-h-[60vh] text-slate-400 p-4 space-y-6">
            <div className="w-full max-w-sm bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
              <FileText size={48} className="mx-auto mb-4 text-slate-300" />
              <h3 className="text-lg font-bold text-slate-800 mb-2">Program Yükle</h3>
              <p className="text-sm text-slate-500 mb-6">
                Dr. Tevfik'in programını bulmak için resim (JPG), PDF veya Excel dosyası yükleyin.
              </p>

              <label className="block w-full">
                <span className="sr-only">Dosya seç</span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
                  className="block w-full text-sm text-slate-500
                        file:mr-4 file:py-2.5 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-bold
                        file:bg-primary file:text-white
                        hover:file:bg-sky-600
                        cursor-pointer"
                />
              </label>
            </div>

            {/* Status & Results */}
            {(isProcessing || processStatus) && (
              <div className="w-full max-w-sm bg-white p-4 rounded-xl shadow-sm border border-slate-100 text-center">
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
                    <p className="text-slate-600 font-medium text-sm">{processStatus}</p>
                  </div>
                ) : (
                  <div className="py-2">
                    <p className={`font-bold mb-3 ${processStatus.includes('Hata') ? 'text-red-500' : 'text-green-600'}`}>
                      {processStatus}
                    </p>

                    {parsedEvents && parsedEvents.length > 0 && (
                      <button
                        onClick={handleAddToCalendar}
                        className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
                      >
                        <Calendar size={20} />
                        iPhone Takvimine Ekle
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Preview of Events */}
            {parsedEvents && parsedEvents.length > 0 && (
              <div className="w-full max-w-sm space-y-2">
                <h4 className="font-bold text-slate-700 px-1">Bulunan Vardiyalar ({parsedEvents.length})</h4>
                {parsedEvents.map((day, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 flex items-start gap-3">
                    <div className="bg-slate-100 px-2 py-1 rounded text-center min-w-[3rem]">
                      <span className="block text-xl font-bold text-slate-700">{day.day}</span>
                    </div>
                    <div className="flex-1 space-y-1">
                      {day.assignments.map((a, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-bold text-slate-800">{a.location}</span>
                          <span className="text-slate-400 mx-1">•</span>
                          <span className="text-slate-500">{a.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {scheduleData?.sourceFile && !parsedEvents && (
              <div className="text-center mt-8 pt-8 border-t border-slate-100 w-full">
                <p className="mb-1 text-xs uppercase font-bold text-slate-400">Şu anki aktif liste</p>
                <p className="font-medium text-slate-600 text-sm">{scheduleData.sourceFile}</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Duty Modal */}
      {showAddDutyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800">Manuel Görev Ekle</h3>
              <button
                onClick={() => setShowAddDutyModal(false)}
                className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Day Picker */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tarih (Aralık 2025)</label>
                <select
                  value={newDuty.day}
                  onChange={(e) => setNewDuty(prev => ({ ...prev, day: e.target.value }))}
                  className="w-full p-3 border border-slate-200 rounded-xl text-lg font-medium focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="">Gün seçin...</option>
                  {Array.from({ length: 31 }, (_, i) => {
                    const day = i + 1;
                    const date = new Date(2025, 11, day); // December 2025
                    const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
                    const dayName = dayNames[date.getDay()];
                    return (
                      <option key={day} value={day}>{day} Aralık ({dayName})</option>
                    );
                  })}
                </select>
              </div>

              {/* Location Picker */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Konum</label>
                <select
                  value={newDuty.location}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl text-lg font-medium focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="Room 201">Room 201</option>
                  <option value="Room 214">Room 214</option>
                  <option value="Abu Sidra">Abu Sidra</option>
                  <option value="Cuma Nöbet">Cuma Nöbet</option>
                  <option value="On Call">On Call</option>
                </select>
              </div>

              {/* Time Picker */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Saat</label>
                <select
                  value={newDuty.time}
                  onChange={(e) => setNewDuty(prev => ({ ...prev, time: e.target.value }))}
                  className="w-full p-3 border border-slate-200 rounded-xl text-lg font-medium focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  {getTimeOptions(newDuty.location).map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100">
              <button
                onClick={handleAddDuty}
                disabled={!newDuty.day}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-sky-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={20} />
                Görev Ekle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-around items-center z-20 safe-area-bottom shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === 'schedule' ? 'text-primary' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Calendar size={28} />
          <span className="text-xs font-bold">Program</span>
        </button>

        <button
          onClick={() => setActiveTab('files')}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === 'files' ? 'text-primary' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <FileText size={28} />
          <span className="text-xs font-bold">Dosyalar</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
