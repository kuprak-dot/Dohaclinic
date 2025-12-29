import React, { useState, useEffect } from 'react';
import { Calendar, FileText, Bell, Clock, MapPin, Sun, Edit3, ChevronDown, ChevronUp, Plus, X, Download, Newspaper, ExternalLink, TrendingUp, Activity, CheckCircle, Trash2, Tag, ArrowUp, ArrowDown, Save, Palette, Bold, ChevronRight } from 'lucide-react';
import { spanishWords } from './spanishWords';
import { parseScheduleFile, generateICS } from './utils/parser';
import { saveAs } from 'file-saver';

function App() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showFullMonth, setShowFullMonth] = useState(false);
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('dailyNotes');
    return saved ? JSON.parse(saved) : {};
  });

  // Manual duty entry state
  const [manualDuties, setManualDuties] = useState(() => {
    const saved = localStorage.getItem('manualDuties');
    return saved ? JSON.parse(saved) : [];
  });
  // Hidden duties (for incorrectly parsed JSON entries)
  const [hiddenDuties, setHiddenDuties] = useState(() => {
    const saved = localStorage.getItem('hiddenDuties');
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
  const [parsedMetadata, setParsedMetadata] = useState(null);

  // News Widget State
  const [news, setNews] = useState([]);
  const [newsIndex, setNewsIndex] = useState(0);
  const [businessNews, setBusinessNews] = useState([]);
  const [businessIndex, setBusinessIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(null);

  useEffect(() => {
    // Check for local schedule first
    const savedSchedule = localStorage.getItem('localSchedule');
    if (savedSchedule) {
      try {
        const parsed = JSON.parse(savedSchedule);
        setScheduleData(parsed);
        // Also set parsedEvents so calendar export works immediately if it aligns
        setParsedEvents(parsed.schedule);
        setLoading(false);
      } catch (e) {
        console.error("Failed to parse saved schedule", e);
        localStorage.removeItem('localSchedule');
        fetchDefaultSchedule();
      }
    } else {
      fetchDefaultSchedule();
    }

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

    // Fetch BBC World News
    const bbcWorldUrl = 'https://feeds.bbci.co.uk/news/world/rss.xml';
    fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(bbcWorldUrl)}`)
      .then(res => res.json())
      .then(data => {
        if (data.items) {
          setNews(data.items.slice(0, 5));
        }
      })
      .catch(err => console.error("World news fetch failed:", err));

    // Fetch Bloomberg Markets News
    const bloombergUrl = 'https://feeds.bloomberg.com/markets/news.rss';
    fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(bloombergUrl)}`)
      .then(res => res.json())
      .then(data => {
        if (data.items) {
          setBusinessNews(data.items.slice(0, 5));
        }
      })
      .catch(err => console.error("Bloomberg news fetch failed:", err));
  }, []);

  const fetchDefaultSchedule = () => {
    fetch(`/schedule.json?t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        setScheduleData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading schedule:", err);
        setLoading(false);
      });
  };

  // Auto-rotate news every 5 seconds
  useEffect(() => {
    if (news.length === 0) return;
    const interval = setInterval(() => {
      setNewsIndex(prev => (prev + 1) % news.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [news]);

  // Auto-rotate business news every 6 seconds (offset from world news)
  useEffect(() => {
    if (businessNews.length === 0) return;
    const interval = setInterval(() => {
      setBusinessIndex(prev => (prev + 1) % businessNews.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [businessNews]);

  // Swipe handlers
  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e, type) => {
    if (!touchStart) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;

    if (Math.abs(diff) > 50) { // Min 50px swipe
      if (type === 'world') {
        if (diff > 0) {
          setNewsIndex(prev => (prev + 1) % news.length);
        } else {
          setNewsIndex(prev => (prev - 1 + news.length) % news.length);
        }
      } else {
        if (diff > 0) {
          setBusinessIndex(prev => (prev + 1) % businessNews.length);
        } else {
          setBusinessIndex(prev => (prev - 1 + businessNews.length) % businessNews.length);
        }
      }
    }
    setTouchStart(null);
  };

  useEffect(() => {
    localStorage.setItem('dailyNotes', JSON.stringify(notes));
  }, [notes]);

  // Save manual duties to localStorage
  useEffect(() => {
    localStorage.setItem('manualDuties', JSON.stringify(manualDuties));
  }, [manualDuties]);

  // Save hidden duties to localStorage
  useEffect(() => {
    localStorage.setItem('hiddenDuties', JSON.stringify(hiddenDuties));
  }, [hiddenDuties]);

  // Training Program State
  const [trainingGroups, setTrainingGroups] = useState(() => {
    const savedGroups = localStorage.getItem('trainingGroups');
    if (savedGroups) return JSON.parse(savedGroups);

    // Migration from old flat list
    const savedItems = localStorage.getItem('trainingItems');
    if (savedItems) {
      const items = JSON.parse(savedItems);
      if (items.length > 0) {
        return [{
          id: Date.now(), // Generate a unique ID for the default group
          title: 'Genel',
          items: items
        }];
      }
    }
    return [];
  });

  const [newGroupName, setNewGroupName] = useState('');
  // We'll manage "new item" input state per group locally in the render or via a map if needed, 
  // but for simplicity, we might just use uncontrolled inputs or a map of inputs.
  // Actually, a simple way is to have a single state object tracking inputs for each group: { [groupId]: 'text' }
  const [groupInputs, setGroupInputs] = useState({});

  // Modal state for adding training items
  const [showAddTrainingItemModal, setShowAddTrainingItemModal] = useState(false);
  const [activeGroupForModal, setActiveGroupForModal] = useState(null);
  const [selectedWorkoutGroupId, setSelectedWorkoutGroupId] = useState(null);

  // Save training groups to localStorage
  useEffect(() => {
    localStorage.setItem('trainingGroups', JSON.stringify(trainingGroups));
    // Clear old storage to avoid confusion? Better to keep as backup or clear it. 
    // Let's keep it for safety but we rely on trainingGroups now.
  }, [trainingGroups]);

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;
    setTrainingGroups(prev => [...prev, {
      id: Date.now(),
      title: newGroupName.trim(),
      items: []
    }]);
    setNewGroupName('');
  };

  const deleteGroup = (groupId) => {
    if (window.confirm('Bu grubu ve içindeki tüm maddeleri silmek istediğinize emin misiniz?')) {
      setTrainingGroups(prev => prev.filter(g => g.id !== groupId));
    }
  };

  const handleAddTrainingItem = (groupId) => {
    const text = groupInputs[groupId];
    if (!text || !text.trim()) return;

    // Split by newlines
    const lines = text.split('\n').filter(line => line.trim());
    const newItems = lines.map((line, index) => ({
      id: Date.now() + index,
      text: line.trim(),
      completed: false
    }));

    setTrainingGroups(prev => prev.map(group => {
      if (group.id === groupId) {
        return { ...group, items: [...group.items, ...newItems] };
      }
      return group;
    }));

    setGroupInputs(prev => ({ ...prev, [groupId]: '' }));
  };

  const handleGroupInputChange = (groupId, value) => {
    setGroupInputs(prev => ({ ...prev, [groupId]: value }));
  };

  // Advanced Item Management
  const [editingItem, setEditingItem] = useState(null); // { groupId, itemId, text, color, isBold }

  const updateItem = (groupId, itemId, updates) => {
    setTrainingGroups(prev => prev.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          items: group.items.map(item =>
            item.id === itemId ? { ...item, ...updates } : item
          )
        };
      }
      return group;
    }));
  };

  const moveItem = (groupId, index, direction) => {
    setTrainingGroups(prev => prev.map(group => {
      if (group.id === groupId) {
        const newItems = [...group.items];
        if (direction === -1 && index > 0) {
          [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
        } else if (direction === 1 && index < newItems.length - 1) {
          [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
        }
        return { ...group, items: newItems };
      }
      return group;
    }));
  };

  const handleSaveItem = () => {
    if (!editingItem) return;
    updateItem(editingItem.groupId, editingItem.itemId, {
      text: editingItem.text,
      color: editingItem.color,
      isBold: editingItem.isBold
    });
    setEditingItem(null);
  };

  const toggleTrainingItem = (groupId, itemId) => {
    setTrainingGroups(prev => prev.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          items: group.items.map(item =>
            item.id === itemId ? { ...item, completed: !item.completed } : item
          )
        };
      }
      return group;
    }));
  };

  const removeTrainingItem = (groupId, itemId) => {
    setTrainingGroups(prev => prev.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          items: group.items.filter(item => item.id !== itemId)
        };
      }
      return group;
    }));
  };

  const resetAllProgress = () => {
    if (window.confirm('Tüm gruplardaki ilerleme sıfırlanacak emin misiniz?')) {
      setTrainingGroups(prev => prev.map(group => ({
        ...group,
        items: group.items.map(item => ({ ...item, completed: false }))
      })));
    }
  };

  const resetGroupProgress = (groupId) => {
    setTrainingGroups(prev => prev.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          items: group.items.map(item => ({ ...item, completed: false }))
        };
      }
      return group;
    }));
  };

  const handleNoteChange = (day, value) => {
    setNotes(prev => ({
      ...prev,
      [day]: value
    }));
  };

  // Quick Note Tags
  const [activeNoteModalDay, setActiveNoteModalDay] = useState(null);
  const noteTags = [
    "Easy Run + Core",
    "Strength (Lower body + Push)",
    "Quality Run + Short Core",
    "Optional Walk (Active Recovery)",
    "Mobility Flow (25–30 min)",
    "Strength (Pull + Posterior Chain)",
    "Optional Session"
  ];

  // State for editing group titles
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupTitle, setEditingGroupTitle] = useState('');

  // Function to update group title
  const updateGroupTitle = (groupId) => {
    if (!editingGroupTitle.trim()) {
      setEditingGroupId(null);
      return;
    }
    setTrainingGroups(prev => prev.map(group => {
      if (group.id === groupId) {
        return { ...group, title: editingGroupTitle.trim() };
      }
      return group;
    }));
    setEditingGroupId(null);
    setEditingGroupTitle('');
  };

  const handleAddTag = (tag) => {
    if (!activeNoteModalDay) return;
    const currentNote = notes[activeNoteModalDay] || '';
    const newNote = currentNote ? `${currentNote} ${tag}` : tag;
    handleNoteChange(activeNoteModalDay, newNote);
    setActiveNoteModalDay(null);
  };

  // Hide a JSON schedule entry
  const hideJsonDuty = (day, location) => {
    setHiddenDuties(prev => [...prev, { day, location }]);
  };

  // Check if a duty is hidden
  const isDutyHidden = (day, location) => {
    return hiddenDuties.some(h => h.day === day && h.location === location);
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
    const currentMonth = today.getMonth(); // 0-indexed
    const currentYear = today.getFullYear();

    // Determine the month/year context of the current scheduleData
    const metaDiffers = scheduleData?.metadata?.month !== undefined && scheduleData.metadata.month !== null;
    const targetMonth = metaDiffers ? scheduleData.metadata.month : currentMonth;
    const targetYear = (metaDiffers && scheduleData.metadata.year) ? scheduleData.metadata.year : currentYear;

    // Only get from JSON if the schedule's month/year matches today
    const isSameMonth = targetMonth === currentMonth && targetYear === currentYear;

    // Get from schedule.json and filter out hidden ones (only if it's the correct month)
    const jsonAssignments = isSameMonth
      ? (scheduleData?.schedule?.find(d => d.day === dayOfMonth)?.assignments || [])
        .filter(a => !isDutyHidden(dayOfMonth, a.location))
        .map(a => ({ ...a, isManual: false }))
      : [];

    // Get manual duties for today
    // Manual duties are currently simple day-based, let's assume they apply to the current real-world month
    const manualToday = manualDuties
      .filter(d => d.day === dayOfMonth)
      .map(d => ({ location: d.location, time: d.time, isManual: true }));

    return [...jsonAssignments, ...manualToday];
  };

  // Get upcoming assignments (next 7 days, EXCLUDING today) - merged with manual duties
  const getUpcomingSchedule = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time for accurate date comparison

    const currentMonth = today.getMonth(); // 0-indexed
    const currentYear = today.getFullYear();

    // Check if we have explicit metadata from the parsed file (e.g. "January List")
    const metaDiffers = scheduleData?.metadata?.month !== undefined && scheduleData.metadata.month !== null;
    let targetMonth = metaDiffers ? scheduleData.metadata.month : currentMonth;
    let targetYear = currentYear;
    if (metaDiffers && scheduleData.metadata.year) targetYear = scheduleData.metadata.year;

    // Create a map of all days with assignments, keyed by YYYY-MM-DD
    const dayMap = new Map();

    // Add schedule.json data
    if (scheduleData?.schedule) {
      scheduleData.schedule
        .forEach(d => {
          // Determine the absolute date for this JSON entry
          let m = targetMonth;
          let y = targetYear;

          // Legacy rollover logic if no metadata: if day is small and we are late in month, it's next month
          if (!metaDiffers) {
            if (today.getDate() > 20 && d.day < 15) {
              m++;
              if (m > 11) { m = 0; y++; }
            }
          }

          const entryDate = new Date(y, m, d.day);
          const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

          // Filter: only show if today or future (unless showFullMonth)
          if (!showFullMonth && entryDate < today) return;
          // If not full month, and we are in "Today view" mode, we usually exclude today from "Upcoming" 
          // because it has its own section. But here we decide based on showFullMonth.
          if (!showFullMonth && entryDate.getTime() === today.getTime()) return;

          const filteredAssignments = (d.assignments || [])
            .filter(a => !isDutyHidden(d.day, a.location))
            .map(a => ({ ...a, isManual: false }));

          if (filteredAssignments.length > 0) {
            dayMap.set(dateKey, {
              day: d.day,
              month: m,
              year: y,
              dateKey,
              dayName: d.dayName || '',
              assignments: filteredAssignments
            });
          }
        });
    }

    // Merge manual duties
    manualDuties
      .forEach(duty => {
        // For manual duties, we need to decide which month they belong to.
        // Usually they are for the "current" context.
        let m = today.getMonth();
        let y = today.getFullYear();

        // If the day is much earlier than today, it might be next month.
        if (duty.day < today.getDate() - 5) {
          m++;
          if (m > 11) { m = 0; y++; }
        }

        const entryDate = new Date(y, m, duty.day);
        const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(duty.day).padStart(2, '0')}`;

        if (!showFullMonth && entryDate < today) return;
        if (!showFullMonth && entryDate.getTime() === today.getTime()) return;

        if (dayMap.has(dateKey)) {
          dayMap.get(dateKey).assignments.push({
            location: duty.location,
            time: duty.time,
            isManual: true
          });
        } else {
          dayMap.set(dateKey, {
            day: duty.day,
            month: m,
            year: y,
            dateKey,
            dayName: '',
            assignments: [{
              location: duty.location,
              time: duty.time,
              isManual: true
            }]
          });
        }
      });

    // Convert to array and sort by absolute date key
    return Array.from(dayMap.values())
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  };


  const todayAssignments = getTodaySchedule();
  const allUpcomingDays = getUpcomingSchedule();
  const upcomingDays = showAllUpcoming || showFullMonth ? allUpcomingDays : allUpcomingDays.slice(0, 4);
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
    setParsedMetadata(null);

    try {
      const result = await parseScheduleFile(file, "Tevfik");
      const schedule = result.schedule || result;
      const metadata = result.metadata || {};

      setParsedEvents(schedule);
      setParsedMetadata(metadata);

      let msg = `Başarılı! ${schedule.length} gün bulundu.`;
      if (metadata.month !== null) {
        const mName = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][metadata.month];
        msg += ` (${mName} ${metadata.year || ''} tespit edildi)`;
      }
      setProcessStatus(msg + ' Lütfen aşağıdan kontrol edip düzenleyin.');
    } catch (error) {
      console.error(error);
      setProcessStatus('Hata: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateParsedEvent = (dayIndex, assignmentIndex, field, value) => {
    setParsedEvents(prev => {
      const newEvents = [...prev];
      const day = { ...newEvents[dayIndex] };
      const assignments = [...day.assignments];
      assignments[assignmentIndex] = { ...assignments[assignmentIndex], [field]: value };
      day.assignments = assignments;
      newEvents[dayIndex] = day;
      return newEvents;
    });
  };

  const removeParsedEvent = (dayIndex, assignmentIndex) => {
    setParsedEvents(prev => {
      const newEvents = [...prev];
      const day = { ...newEvents[dayIndex] };
      day.assignments = day.assignments.filter((_, i) => i !== assignmentIndex);
      if (day.assignments.length === 0) {
        return newEvents.filter((_, i) => i !== dayIndex);
      }
      newEvents[dayIndex] = day;
      return newEvents;
    });
  };

  const handleAddToMainProgram = () => {
    if (!parsedEvents || parsedEvents.length === 0) return;

    const newData = {
      lastUpdated: new Date().toISOString(),
      sourceFile: 'Kullanıcı Tarafından Düzenlendi',
      fileLink: '#',
      fileId: 'local-upload',
      schedule: parsedEvents,
      metadata: parsedMetadata
    };

    setScheduleData(newData);
    localStorage.setItem('localSchedule', JSON.stringify(newData));
    setParsedEvents(null);
    setParsedMetadata(null);
    setProcessStatus('Program başarıyla ana ekrana eklendi! Program sekmesinden görebilirsiniz.');

    // Optionally switch to schedule tab
    // setActiveTab('schedule'); 
  };

  const handleResetSchedule = () => {
    if (window.confirm("Yüklü programı silip varsayılana dönmek istediğinize emin misiniz?")) {
      localStorage.removeItem('localSchedule');
      setParsedEvents(null);
      setScheduleData(null); // Clear current
      setProcessStatus('');
      setLoading(true);
      fetchDefaultSchedule();
    }
  };

  const handleFactoryReset = () => {
    if (window.confirm('DİKKAT: Tüm kişisel verileriniz (notlar, eklenen görevler, antrenman geçmişi ve yüklenen listeler) SİLİNECEK. Uygulama ilk haline dönecek. Emin misiniz?')) {
      localStorage.clear();
      window.location.reload();
    }
  };




  // Export full month schedule (JSON + manual - hidden) to ICS
  const exportFullScheduleToICS = () => {
    const upcoming = getUpcomingSchedule();
    // If we want FULL month including today:
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // We can just call getUpcomingSchedule with a temporary override or just filter differently.
    // Actually, getUpcomingSchedule filters out today. Let's get today's too.
    const todayObj = todayAssignments.length > 0 ? {
      day: today.getDate(),
      month: today.getMonth(),
      year: today.getFullYear(),
      assignments: todayAssignments
    } : null;

    let fullList = [...upcoming];
    if (todayObj) fullList.push(todayObj);

    // Sort again
    fullList.sort((a, b) => {
      const dateA = new Date(a.year, a.month, a.day);
      const dateB = new Date(b.year, b.month, b.day);
      return dateA - dateB;
    });

    if (fullList.length === 0) {
      alert('Takvime eklenecek görev bulunamadı!');
      return;
    }

    const icsContent = generateICS(fullList);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });

    // Use detected month for filename
    const mName = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'][fullList[0].month];
    saveAs(blob, `${mName}_${fullList[0].year}_program.ics`);
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

      {/* World News Widget */}
      {news.length > 0 && (
        <div
          className="bg-gradient-to-r from-slate-800 to-slate-900 px-3 py-2"
          onTouchStart={handleTouchStart}
          onTouchEnd={(e) => handleTouchEnd(e, 'world')}
        >
          <a
            href={news[newsIndex]?.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 text-white"
          >
            <Newspaper size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
            <span className="text-xs font-medium flex-1 line-clamp-2">
              {news[newsIndex]?.title}
            </span>
            <ExternalLink size={14} className="text-slate-400 flex-shrink-0" />
          </a>
          <div className="flex justify-center gap-1 mt-1">
            {news.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setNewsIndex(idx)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === newsIndex ? 'bg-red-400' : 'bg-slate-600'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Business News Widget */}
      {businessNews.length > 0 && (
        <div
          className="bg-gradient-to-r from-emerald-800 to-emerald-900 px-3 py-2"
          onTouchStart={handleTouchStart}
          onTouchEnd={(e) => handleTouchEnd(e, 'business')}
        >
          <a
            href={businessNews[businessIndex]?.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 text-white"
          >
            <TrendingUp size={14} className="text-emerald-300 flex-shrink-0 mt-0.5" />
            <span className="text-xs font-medium flex-1 line-clamp-2">
              {businessNews[businessIndex]?.title}
            </span>
            <ExternalLink size={14} className="text-emerald-400 flex-shrink-0" />
          </a>
          <div className="flex justify-center gap-1 mt-1">
            {businessNews.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setBusinessIndex(idx)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === businessIndex ? 'bg-emerald-300' : 'bg-emerald-700'}`}
              />
            ))}
          </div>
        </div>
      )}

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
                        <button
                          onClick={() => {
                            const today = new Date().getDate();
                            assignment.isManual
                              ? handleRemoveDuty(today, assignment.location)
                              : hideJsonDuty(today, assignment.location);
                          }}
                          className="w-6 h-6 bg-red-100 text-red-500 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors"
                        >
                          <X size={16} />
                        </button>
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
            {/* Today's Note */}
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 mt-2">
              <div className="flex items-center gap-2">
                <Edit3 size={18} className="text-slate-400" />
                <input
                  type="text"
                  value={notes[new Date().getDate()] || ''}
                  onChange={(e) => handleNoteChange(new Date().getDate(), e.target.value)}
                  placeholder={getNotePlaceholder(todayAssignments)}
                  className="flex-1 text-lg font-bold italic bg-transparent border-none focus:ring-0 p-0 text-[#6b1225] placeholder:text-[#b95b75]/70"
                />
                <button
                  onClick={() => setActiveNoteModalDay(new Date().getDate())}
                  className="p-1.5 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Tag size={16} />
                </button>
              </div>
            </div>

            {/* Upcoming Schedule */}
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="font-bold text-slate-700 text-lg">
                  {showFullMonth ? 'Tüm Ay Programı' : 'Yaklaşan Görevler'}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowFullMonth(!showFullMonth)}
                    className={`px-3 h-8 rounded-full text-sm font-medium transition-colors shadow-sm flex items-center gap-1 ${showFullMonth ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
                  >
                    <Calendar size={14} />
                    {showFullMonth ? 'Kısalt' : 'Tümünü Gör'}
                  </button>
                  <button
                    onClick={exportFullScheduleToICS}
                    className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center hover:bg-green-600 transition-colors shadow-sm"
                    title="iOS Takvime Aktar"
                  >
                    <Download size={18} />
                  </button>
                  <button
                    onClick={() => setShowAddDutyModal(true)}
                    className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center hover:bg-sky-600 transition-colors shadow-sm"
                    title="Manuel Görev Ekle"
                  >
                    <Plus size={20} />
                  </button>
                </div>
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
                      // Calculate day name
                      const today = new Date();
                      let targetYear = day.yearOverride || today.getFullYear();
                      let targetMonth = day.monthOverride !== null && day.monthOverride !== undefined ? day.monthOverride : today.getMonth();

                      // Legacy logic if no override
                      if (day.monthOverride === null && day.isNextMonth) {
                        targetMonth++;
                        if (targetMonth > 11) {
                          targetMonth = 0;
                          targetYear++;
                        }
                      }

                      const date = new Date(targetYear, targetMonth, day.day);
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
                                        <button
                                          onClick={() => assignment.isManual
                                            ? handleRemoveDuty(day.day, assignment.location)
                                            : hideJsonDuty(day.day, assignment.location)
                                          }
                                          className="w-5 h-5 bg-red-100 text-red-500 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors"
                                        >
                                          <X size={14} />
                                        </button>
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
                                    className="flex-1 text-lg font-bold italic bg-transparent border-none focus:ring-0 p-0 text-[#6b1225] placeholder:text-[#b95b75]/70"
                                  />
                                  <button
                                    onClick={() => setActiveNoteModalDay(day.day)}
                                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-lg transition-colors"
                                  >
                                    <Tag size={16} />
                                  </button>
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


        {activeTab === 'training' && (
          <div className="space-y-6">

            {/* Add Group Section */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
              <h3 className="font-bold text-slate-700 mb-2">Yeni Grup Ekle</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Örn: Koşu, Ağırlık..."
                  className="flex-1 rounded-lg border-slate-200 focus:border-primary focus:ring-primary"
                />
                <button
                  onClick={handleAddGroup}
                  className="bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-sky-600 transition-colors"
                >
                  Ekle
                </button>
              </div>
            </div>

            {/* Groups */}
            {trainingGroups.map(group => {
              const completedCount = group.items.filter(i => i.completed).length;
              const totalCount = group.items.length;
              const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

              return (
                <div
                  key={group.id}
                  onClick={() => setSelectedWorkoutGroupId(group.id)}
                  className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 cursor-pointer hover:border-primary/30 transition-all group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-bold text-slate-800 transition-colors group-hover:text-primary">
                      {group.title}
                    </h2>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 text-sm font-medium">
                        {completedCount}/{totalCount}
                      </span>
                      <ChevronRight size={20} className="text-slate-300 group-hover:text-primary transition-colors" />
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {totalCount > 0 && (
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  )}
                </div>
              );
            })}

            {trainingGroups.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <p>Henüz bir antrenman grubu yok. Yukarıdan ekleyebilirsiniz.</p>
              </div>
            )}

            {trainingGroups.length > 0 && (
              <button
                onClick={resetAllProgress}
                className="w-full py-3 text-red-500 bg-red-50 rounded-xl font-medium hover:bg-red-100 transition-colors"
              >
                Tüm İlerlemeyi Sıfırla
              </button>
            )}

          </div>
        )}

        {activeTab === 'files' && (
          <div className="flex flex-col items-center justify-start min-h-[60vh] p-4 space-y-6">
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

            {/* Status */}
            {(isProcessing || processStatus) && (
              <div className="w-full max-w-sm bg-white p-4 rounded-xl shadow-sm border border-slate-100 text-center">
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
                    <p className="text-slate-600 font-medium text-sm">{processStatus}</p>
                  </div>
                ) : (
                  <div className="py-2">
                    <p className={`font-bold ${processStatus.includes('Hata') ? 'text-red-500' : 'text-green-600'}`}>
                      {processStatus}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Preview of Events (Editable) */}
            {parsedEvents && parsedEvents.length > 0 && (
              <div className="w-full max-w-sm space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h4 className="font-bold text-slate-700">Bulunan Vardiyalar ({parsedEvents.reduce((acc, curr) => acc + curr.assignments.length, 0)})</h4>
                  <button
                    onClick={() => { setParsedEvents(null); setProcessStatus(''); }}
                    className="text-xs text-slate-400 hover:text-red-500 font-medium"
                  >
                    Temizle
                  </button>
                </div>

                <div className="space-y-2">
                  {parsedEvents.map((day, dIdx) => (
                    <div key={dIdx} className="bg-white p-3 rounded-xl border border-slate-100 space-y-2">
                      <div className="flex items-center gap-3 border-b border-slate-50 pb-2">
                        <div className="bg-slate-100 px-2 py-0.5 rounded text-center min-w-[2.5rem]">
                          <span className="text-lg font-bold text-slate-700">{day.day}</span>
                        </div>
                        <span className="text-xs font-bold text-slate-400 uppercase">GÜN</span>
                      </div>

                      <div className="space-y-3">
                        {day.assignments.map((a, aIdx) => (
                          <div key={aIdx} className="relative group bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <button
                              onClick={() => removeParsedEvent(dIdx, aIdx)}
                              className="absolute -top-2 -right-2 w-5 h-5 bg-red-100 text-red-500 rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={12} />
                            </button>

                            <div className="grid grid-cols-1 gap-2">
                              <input
                                type="text"
                                value={a.location}
                                onChange={(e) => updateParsedEvent(dIdx, aIdx, 'location', e.target.value)}
                                className="bg-transparent border-none p-0 font-bold text-slate-800 focus:ring-0 text-sm"
                                placeholder="Konum..."
                              />
                              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <Clock size={12} />
                                <input
                                  type="text"
                                  value={a.time}
                                  onChange={(e) => updateParsedEvent(dIdx, aIdx, 'time', e.target.value)}
                                  className="bg-transparent border-none p-0 focus:ring-0 w-full"
                                  placeholder="Saat..."
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* New Buttons */}
                <div className="pt-4 space-y-3">
                  <button
                    onClick={() => {
                      const icsContent = generateICS(parsedEvents.map(day => ({
                        ...day,
                        month: parsedMetadata?.month,
                        year: parsedMetadata?.year
                      })));
                      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
                      saveAs(blob, `yeni_program.ics`);
                    }}
                    className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-700 transition-colors shadow-sm"
                  >
                    <Download size={20} />
                    iPhone Takvimine Ekle
                  </button>

                  <button
                    onClick={handleAddToMainProgram}
                    className="w-full py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-sky-600 transition-colors shadow-lg"
                  >
                    <Plus size={20} />
                    Ana Programa Ekle
                  </button>
                </div>
              </div>
            )}

            {scheduleData?.sourceFile && !parsedEvents && (
              <div className="text-center mt-8 pt-8 border-t border-slate-100 w-full space-y-4">
                <div>
                  <p className="mb-1 text-xs uppercase font-bold text-slate-400">Şu anki aktif liste</p>
                  <p className="font-medium text-slate-600 text-sm">{scheduleData.sourceFile}</p>
                </div>

                {scheduleData.fileId === 'local-upload' && (
                  <button
                    onClick={handleResetSchedule}
                    className="px-4 py-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors"
                  >
                    Varsayılan Listeye Dön
                  </button>
                )}
              </div>
            )}

            <div className="pt-8 mt-8 border-t border-slate-100 w-full">
              <button
                onClick={handleFactoryReset}
                className="flex items-center justify-center space-x-2 w-full px-4 py-3 text-slate-400 border border-slate-200 hover:bg-red-50 hover:text-red-500 hover:border-red-100 rounded-xl text-xs font-medium transition-colors"
              >
                <span>Uygulamayı Tamamen Sıfırla</span>
              </button>
            </div>
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
                {(() => {
                  const displayMonth = scheduleData?.metadata?.month !== undefined && scheduleData?.metadata?.month !== null
                    ? scheduleData.metadata.month
                    : (new Date().getDate() > 20 ? (new Date().getMonth() + 1) % 12 : new Date().getMonth());

                  const displayYear = scheduleData?.metadata?.year || (displayMonth === 0 && new Date().getMonth() === 11 ? new Date().getFullYear() + 1 : new Date().getFullYear());
                  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
                  const monthName = monthNames[displayMonth];

                  return (
                    <>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tarih ({monthName} {displayYear})</label>
                      <select
                        value={newDuty.day}
                        onChange={(e) => setNewDuty(prev => ({ ...prev, day: e.target.value }))}
                        className="w-full p-3 border border-slate-200 rounded-xl text-lg font-medium focus:ring-2 focus:ring-primary focus:border-primary"
                      >
                        <option value="">Gün seçin...</option>
                        {Array.from({ length: 31 }, (_, i) => {
                          const day = i + 1;
                          const date = new Date(displayYear, displayMonth, day);
                          const dayNamesShort = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
                          const dayNameShort = dayNamesShort[date.getDay()];

                          // Basic check for valid date (e.g. Feb 30)
                          if (date.getMonth() !== displayMonth) return null;

                          return (
                            <option key={day} value={day}>{day} {monthName} ({dayNameShort})</option>
                          );
                        })}
                      </select>
                    </>
                  );
                })()}
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
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe z-10 px-6 py-3">
        <div className="flex items-center justify-around max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'schedule' ? 'text-primary' : 'text-slate-400'}`}
          >
            <Calendar size={24} strokeWidth={activeTab === 'schedule' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Program</span>
          </button>

          <button
            onClick={() => setActiveTab('training')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'training' ? 'text-primary' : 'text-slate-400'}`}
          >
            <Activity size={24} strokeWidth={activeTab === 'training' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Antrenman</span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'files' ? 'text-primary' : 'text-slate-400'}`}
          >
            <FileText size={24} strokeWidth={activeTab === 'files' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Dosyalar</span>
          </button>
        </div>
      </nav>
      {/* Quick Add Tag Modal */}
      {activeNoteModalDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setActiveNoteModalDay(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-4 shadow-xl animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800">Hızlı Ekle</h3>
              <button
                onClick={() => setActiveNoteModalDay(null)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {noteTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleAddTag(tag)}
                  className="p-3 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-primary hover:text-white rounded-xl border border-slate-200 transition-colors text-left"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Workout Group Detail Modal */}
      {selectedWorkoutGroupId && (() => {
        const group = trainingGroups.find(g => g.id === selectedWorkoutGroupId);
        if (!group) return null;

        const completedCount = group.items.filter(i => i.completed).length;
        const totalCount = group.items.length;
        const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedWorkoutGroupId(null)}>
            <div
              className="bg-slate-50 rounded-t-3xl sm:rounded-2xl w-full max-lg h-[90vh] sm:h-auto sm:max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-white px-5 py-4 border-b border-slate-100 sticky top-0 z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1">
                    {editingGroupId === group.id ? (
                      <input
                        type="text"
                        value={editingGroupTitle}
                        onChange={(e) => setEditingGroupTitle(e.target.value)}
                        onBlur={() => updateGroupTitle(group.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') updateGroupTitle(group.id);
                          if (e.key === 'Escape') setEditingGroupId(null);
                        }}
                        autoFocus
                        className="text-2xl font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 w-full"
                      />
                    ) : (
                      <h2
                        className="text-2xl font-bold text-slate-800 cursor-pointer flex items-center gap-2 group/title"
                        onClick={() => {
                          setEditingGroupId(group.id);
                          setEditingGroupTitle(group.title);
                        }}
                      >
                        {group.title}
                        <Edit3 size={18} className="text-slate-300 group-hover/title:text-primary transition-colors" />
                      </h2>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedWorkoutGroupId(null)}
                    className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex items-center justify-between mb-4">
                  <p className="text-slate-500 font-medium">
                    {completedCount} / {totalCount} tamamlandı
                  </p>
                  <div className="flex items-center gap-3">
                    {completedCount > 0 && (
                      <button
                        onClick={() => resetGroupProgress(group.id)}
                        className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full hover:bg-slate-200"
                      >
                        İlerlemeyi Sıfırla
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (window.confirm('Bu grubu silmek istediğinize emin misiniz?')) {
                          deleteGroup(group.id);
                          setSelectedWorkoutGroupId(null);
                        }
                      }}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Progress Bar in Modal */}
                {totalCount > 0 && (
                  <div className="w-full bg-slate-100 rounded-full h-3">
                    <div
                      className="bg-green-500 h-3 rounded-full transition-all duration-500 shadow-sm"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                )}
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-5 pb-24 space-y-3">
                {group.items.map((item, index) => {
                  const isEditing = editingItem?.itemId === item.id;

                  if (isEditing) {
                    return (
                      <div key={item.id} className="p-4 rounded-xl border-2 border-primary bg-white shadow-md space-y-4">
                        <input
                          type="text"
                          value={editingItem.text}
                          onChange={(e) => setEditingItem(prev => ({ ...prev, text: e.target.value }))}
                          className="w-full p-3 border border-slate-200 rounded-xl text-lg focus:ring-2 focus:ring-primary focus:border-primary"
                          autoFocus
                        />
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            {['text-slate-800', 'text-red-600', 'text-blue-600', 'text-green-600', 'text-purple-600'].map((colorClass) => {
                              const bgClass = colorClass.replace('text-', 'bg-');
                              return (
                                <button
                                  key={colorClass}
                                  onClick={() => setEditingItem(prev => ({ ...prev, color: colorClass }))}
                                  className={`w-7 h-7 rounded-full ${bgClass} ${editingItem.color === colorClass ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                                />
                              );
                            })}
                            <button
                              onClick={() => setEditingItem(prev => ({ ...prev, isBold: !prev.isBold }))}
                              className={`p-2 rounded-lg ${editingItem.isBold ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:bg-slate-100'}`}
                            >
                              <Bold size={20} />
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setEditingItem(null)} className="px-4 py-2 text-slate-500 font-bold">İptal</button>
                            <button onClick={handleSaveItem} className="px-4 py-2 bg-primary text-white rounded-xl font-bold flex items-center gap-1">
                              <Save size={18} /> Kaydet
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={item.id} className={`group p-4 rounded-xl border transition-all ${item.completed ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-white border-slate-200 shadow-sm hover:shadow-md'}`}>
                      <div className="flex items-start gap-4">
                        <div
                          onClick={() => toggleTrainingItem(group.id, item.id)}
                          className={`mt-1 w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-all cursor-pointer ${item.completed ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 hover:border-primary hover:bg-primary/5'}`}
                        >
                          {item.completed && <CheckCircle size={18} />}
                        </div>
                        <span
                          onClick={() => toggleTrainingItem(group.id, item.id)}
                          className={`flex-1 text-lg cursor-pointer leading-tight transition-all ${item.completed ? 'text-slate-400 line-through' : (item.color || 'text-slate-800')} ${(item.isBold && !item.completed) ? 'font-bold' : 'font-medium'}`}
                        >
                          {item.text}
                        </span>
                        {item.completed && (
                          <button onClick={(e) => { e.stopPropagation(); removeTrainingItem(group.id, item.id); }} className="p-1.5 text-slate-300 hover:text-red-500">
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>

                      {!item.completed && (
                        <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity pt-2 mt-2 border-t border-slate-50">
                          <button onClick={() => moveItem(group.id, index, -1)} disabled={index === 0} className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"><ArrowUp size={18} /></button>
                          <button onClick={() => moveItem(group.id, index, 1)} disabled={index === group.items.length - 1} className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"><ArrowDown size={18} /></button>
                          <button onClick={() => setEditingItem({ groupId: group.id, itemId: item.id, text: item.text, color: item.color || 'text-slate-800', isBold: item.isBold || false })} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit3 size={18} /></button>
                          <button onClick={() => removeTrainingItem(group.id, item.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Floating Footer in Modal */}
              <div className="p-5 bg-white border-t border-slate-100 sticky bottom-0 z-10">
                <button
                  onClick={() => {
                    setActiveGroupForModal(group.id);
                    setShowAddTrainingItemModal(true);
                  }}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-sky-600 transition-transform active:scale-95"
                >
                  <Plus size={24} /> Yeni Madde Ekle
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Training Item Modal */}
      {showAddTrainingItemModal && activeGroupForModal && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-0 sm:p-4 bg-black/50"
          onClick={() => setShowAddTrainingItemModal(false)}>
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-xl animate-in slide-in-from-bottom duration-300"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-lg text-slate-800">Antrenman Ekle</h3>
              <button
                onClick={() => setShowAddTrainingItemModal(false)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            <div>
              <textarea
                value={groupInputs[activeGroupForModal] || ''}
                onChange={(e) => handleGroupInputChange(activeGroupForModal, e.target.value)}
                autoFocus
                placeholder="Yapılacak hareketi veya programı buraya yazın..."
                className="w-full p-3 border border-slate-200 rounded-xl text-base focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                rows={5}
              />
              <p className="text-xs text-slate-400 mt-2 text-right">
                Enter tuşu yeni satır ekler
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  handleAddTrainingItem(activeGroupForModal);
                  setShowAddTrainingItemModal(false);
                }}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-sky-600 transition-colors shadow-sm"
              >
                Ekle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
