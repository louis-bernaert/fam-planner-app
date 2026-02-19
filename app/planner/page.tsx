"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import { Icon } from "../components/Icon";

type Theme = 'light' | 'dark' | 'auto';

type User = {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  email?: string;
  points: number;
  unavailable: string[];
  familyId?: string;
  isAdmin?: boolean;
  participatesInLeaderboard?: boolean;
  participatesInAutoAssign?: boolean;
};

type Family = {
  id: string;
  name: string;
  code: string;
};

type Task = {
  id: string;
  title: string;
  duration: number;
  penibility: number;
  slot: string;
  schedules?: string[];
  familyId?: string;
};

type Assignment = {
  taskId: string;
  userId: string;
};

type ExceptionalTask = {
  id: string;
  title: string;
  duration: number;
  penibility: number;
  date: string;
  userId: string;
  validated: boolean;
  createdAt: string;
};

type ValidatedTask = {
  taskId: string;
  date: string;
  userId: string;
  validated: boolean;
  validatedAt?: string;
  delegatedTo?: string | null; // userId of person who actually did it, or null if nobody
  delegatedFrom?: string; // userId of person who delegated
};

type WeeklyHistory = {
  weekStart: string; // ISO date du lundi de la semaine
  userId: string;
  pointsEarned: number;
  quota: number;
  balance: number; // positif = surplus, négatif = déficit
};

// Évaluation personnelle d'une tâche par un utilisateur
type TaskEvaluation = {
  taskId: string;
  userId: string;
  duration: number;
  penibility: number;
};

// Coût normalisé pour l'auto-attribution
type NormalizedCost = {
  userId: string;
  taskId: string;
  cost: number; // Coût final normalisé (0-1)
  penRank: number;
  durRank: number;
  penRel: number;
  durRel: number;
};

const features = [
  {
    title: "Tâches pondérées",
    text: "Temps, pénibilité et indice calculé automatiquement pour équilibrer la charge.",
    icon: "fa-balance-scale",
  },
  {
    title: "Disponibilités incluses",
    text: "Chaque membre indique ses créneaux d'absence pour éviter les conflits.",
    icon: "fa-calendar-check",
  },
  {
    title: "Attribution intelligente",
    text: "Assignation manuelle ou auto, en gardant l'équité et une part d'aléatoire.",
    icon: "fa-random",
  },
];

const daySlots = [
  "Lun · Matin",
  "Lun · Soir",
  "Mar · Matin",
  "Mar · Soir",
  "Mer · Matin",
  "Mer · Soir",
  "Jeu · Matin",
  "Jeu · Soir",
  "Ven · Matin",
  "Ven · Soir",
  "Sam · Matin",
  "Sam · Soir",
  "Dim · Matin",
  "Dim · Soir",
];

const dayOptions = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function uuid() {
  return crypto.randomUUID();
}

function makeFullName(first?: string, last?: string, fallback?: string) {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const combined = [f, l].filter(Boolean).join(" ");
  if (combined) return combined;
  if (fallback?.trim()) return fallback.trim();
  return "Utilisateur";
}

export default function PlannerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [families, setFamilies] = useState<Family[]>([]);

  const [users, setUsers] = useState<User[]>([]);

  const [tasks, setTasks] = useState<Task[]>([]);

  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [selectedFamily, setSelectedFamily] = useState<string>("");

  const [newUserFirst, setNewUserFirst] = useState("");
  const [newUserLast, setNewUserLast] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [editFamilyId, setEditFamilyId] = useState<string>("");
  const [editFamilyName, setEditFamilyName] = useState<string>("");
  const [newFamilyName, setNewFamilyName] = useState("");
  const [newTask, setNewTask] = useState({
    title: "",
    duration: 30,
    penibility: 30,
  });
  const [newTaskDay, setNewTaskDay] = useState<string>(dayOptions[0]);
  const [newTaskTime, setNewTaskTime] = useState<string>("08:00");
  const [newTaskSchedules, setNewTaskSchedules] = useState<string[]>([]);
  const [newUnavailable, setNewUnavailable] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState({ name: "", email: "", password: "", familyId: "" });
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"monespace" | "taches" | "dispos" | "planificateur" | "points">("monespace");
  const [paramMessage, setParamMessage] = useState<string>("");
  const [addUserMessage, setAddUserMessage] = useState<string>("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskDraft, setEditTaskDraft] = useState({
    title: "",
    duration: 30,
    penibility: 30,
    slot: daySlots[0],
  });
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, { day: string; time: string }>>({});
  const [joinFamilyName, setJoinFamilyName] = useState<string>("");
  const [joinFamilyCode, setJoinFamilyCode] = useState<string>("");
  const [editUserId, setEditUserId] = useState<string>("");
  const [editUserDraft, setEditUserDraft] = useState<{ firstName: string; lastName: string; email: string; password: string }>({ firstName: "", lastName: "", email: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  
  // Calendar state
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [calendarMembers, setCalendarMembers] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showMemberSettings, setShowMemberSettings] = useState(false);

  // Planificateur state - affiche 2 jours à la fois
  const [plannerStartDate, setPlannerStartDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
const [taskAssignments, setTaskAssignments] = useState<Record<string, { date: string; userIds: string[] }>>({});

  // Mon Espace state
  const [showPastTasks, setShowPastTasks] = useState(false);
  const [exceptionalTasks, setExceptionalTasks] = useState<ExceptionalTask[]>([]);
  const [validatedTasks, setValidatedTasks] = useState<ValidatedTask[]>([]);
  const [newExceptionalTask, setNewExceptionalTask] = useState({ title: "", duration: 30, penibility: 30 });
  const [delegationMenu, setDelegationMenu] = useState<{ taskId: string; date: Date; timeSlot: string } | null>(null);
  const [weeklyHistory, setWeeklyHistory] = useState<WeeklyHistory[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('weeklyHistory');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.warn('Error parsing weeklyHistory', e);
        }
      }
    }
    return [];
  });
  const [pointsHistoryModal, setPointsHistoryModal] = useState<{ userId: string; userName: string } | null>(null);
  const [showQuotaExplain, setShowQuotaExplain] = useState(false);

  // View mode state (desktop/mobile app) - auto-detect based on screen size
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768 ? 'mobile' : 'desktop';
    }
    return 'desktop';
  });

  // Auto-update viewMode on window resize
  useEffect(() => {
    const handleResize = () => {
      setViewMode(window.innerWidth < 768 ? 'mobile' : 'desktop');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mobile-specific states
  const [selectedMobileDay, setSelectedMobileDay] = useState<Date>(new Date());
  const [taskSearch, setTaskSearch] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [mobileSelectedUser, setMobileSelectedUser] = useState<string | null>(null);
  const [mobileNewTaskSchedules, setMobileNewTaskSchedules] = useState<string[]>([]);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date | null>(new Date());

  // Task evaluations state
  const [taskEvaluations, setTaskEvaluations] = useState<TaskEvaluation[]>([]);
  const [showEvaluationModal, setShowEvaluationModal] = useState<string | null>(null); // taskId or null
  const [pendingEvaluation, setPendingEvaluation] = useState<{ duration: number; penibility: number }>({ duration: 30, penibility: 30 });
  const [showAutoAssignError, setShowAutoAssignError] = useState(false);
  const [missingEvaluationUsers, setMissingEvaluationUsers] = useState<{ name: string; evaluated: number; total: number }[]>([]);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string; details?: string[] } | null>(null);
  const [toastDetailsOpen, setToastDetailsOpen] = useState(false);
  const [adminAssignMenu, setAdminAssignMenu] = useState<{ taskId: string; date: Date; key: string } | null>(null);
  const [mobileCalendarView, setMobileCalendarView] = useState<'month' | 'week' | 'day'>('month');
  const [mobileShowTaskForm, setMobileShowTaskForm] = useState(false);
  const [mobileShowExceptionalForm, setMobileShowExceptionalForm] = useState(false);
  const [mobileDelegationModal, setMobileDelegationModal] = useState<{ taskId: string; date: Date } | null>(null);

  // Fermer le menu admin quand on clique en dehors
  useEffect(() => {
    if (!adminAssignMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.adminAssignWrapper}`)) {
        setAdminAssignMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [adminAssignMenu]);

  // Theme state
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as Theme) || 'auto';
    }
    return 'auto';
  });

  // Apply theme effect
  useEffect(() => {
    const root = document.documentElement;
    localStorage.setItem('theme', theme);
    
    if (theme === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  // Apply data-view attribute for mobile styling
  useEffect(() => {
    const root = document.documentElement;
    if (viewMode === 'mobile') {
      root.setAttribute('data-view', 'mobile');
    } else {
      root.removeAttribute('data-view');
    }
  }, [viewMode]);

  // Persist weeklyHistory to localStorage whenever it changes
  useEffect(() => {
    if (weeklyHistory.length > 0) {
      localStorage.setItem('weeklyHistory', JSON.stringify(weeklyHistory));
    }
  }, [weeklyHistory]);

  // Auto-dismiss toast after delay (longer if has details)
  useEffect(() => {
    if (toastMessage) {
      setToastDetailsOpen(false);
      const delay = toastMessage.details ? 8000 : 4000;
      const timer = setTimeout(() => setToastMessage(null), delay);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const tabs = [
    { id: "monespace" as const, label: "Mon Espace", shortLabel: "Accueil", icon: "home" as const },
    { id: "planificateur" as const, label: "Planificateur", shortLabel: "Planning", icon: "calendarAlt" as const },
    { id: "points" as const, label: "Compteur de points", shortLabel: "Points", icon: "chartBar" as const },
    { id: "taches" as const, label: "Tâches", shortLabel: "Tâches", icon: "clipboardList" as const },
    { id: "dispos" as const, label: "Calendrier", shortLabel: "Agenda", icon: "calendar" as const },
  ];

  // Calendar functions
  const loadCalendarData = async () => {
    if (!selectedFamily) return;
    
    try {
      // Load members with calendar settings
      const membersRes = await fetch(`/api/calendar/members?familyId=${selectedFamily}`);
      if (membersRes.ok) {
        const membersData = await membersRes.json();
        setCalendarMembers(membersData);
      }
      
      // Load calendar events
      const eventsRes = await fetch(`/api/calendar?familyId=${selectedFamily}`);
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setCalendarEvents(eventsData);
      }
    } catch (error) {
      console.error("Failed to load calendar data", error);
    }
  };
  
  const updateMemberCalendarSettings = async (membershipId: string, color?: string, calendarUrl?: string) => {
    try {
      console.log("Saving calendar settings:", { membershipId, color, calendarUrl });
      const res = await fetch("/api/calendar/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId, color, calendarUrl }),
      });
      
      if (res.ok) {
        console.log("Calendar settings saved successfully");
        // Reload calendar data
        loadCalendarData();
      } else {
        const errorData = await res.json();
        console.error("Failed to save:", errorData);
        alert("Erreur lors de la sauvegarde: " + (errorData.error || "Erreur inconnue"));
      }
    } catch (error) {
      console.error("Failed to update member settings", error);
      alert("Erreur lors de la sauvegarde");
    }
  };

  // Update local state immediately for responsive UI
  const updateMemberLocalState = (memberId: string, field: "color" | "calendarUrl", value: string) => {
    setCalendarMembers(prev => prev.map(m => 
      m.id === memberId ? { ...m, [field]: value } : m
    ));
  };
  
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    
    // Add days from previous month
    const prevMonth = new Date(year, month, 0);
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonth.getDate() - i),
        isCurrentMonth: false,
      });
    }
    
    // Add days of current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }
    
    // Add days from next month to complete the grid
    const remaining = 42 - days.length; // 6 weeks * 7 days
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }
    
    return days;
  };
  
  const getEventsForDate = (date: Date) => {
    return calendarEvents.filter(event => {
      const eventStart = new Date(event.start);
      return eventStart.toDateString() === date.toDateString();
    });
  };
  
  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  };
  
  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
  };

  // Planificateur functions
  const getPlannerDays = () => {
    const day1 = new Date(plannerStartDate);
    const day2 = new Date(plannerStartDate);
    day2.setDate(day2.getDate() + 1);
    return [day1, day2];
  };

  const navigatePlannerDays = (direction: number) => {
    const newDate = new Date(plannerStartDate);
    newDate.setDate(newDate.getDate() + (direction * 2));
    setPlannerStartDate(newDate);
  };

  const formatPlannerDate = (date: Date) => {
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const getDayOfWeek = (date: Date) => {
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    return days[date.getDay()];
  };

  const getTasksForDay = (date: Date) => {
    const dayOfWeek = getDayOfWeek(date);
    return familyTasks.filter(task => {
      const schedules = task.schedules && task.schedules.length > 0 ? task.schedules : [task.slot];
      return schedules.some(schedule => schedule.startsWith(dayOfWeek));
    });
  };

  const getTaskTimeSlot = (task: Task, date: Date): string => {
    const dayOfWeek = getDayOfWeek(date);
    const schedules = task.schedules && task.schedules.length > 0 ? task.schedules : [task.slot];
    const matchingSchedule = schedules.find(s => s.startsWith(dayOfWeek));
    if (matchingSchedule) {
      // Extract time from format "Lun · 08:00" or "Lun · Matin"
      const parts = matchingSchedule.split(' · ');
      if (parts.length >= 2) {
        const timePart = parts[1];
        // Handle legacy Matin/Soir format
        if (timePart === 'Matin') return '08:00';
        if (timePart === 'Soir') return '18:00';
        return timePart;
      }
    }
    return '08:00';
  };

  // Parse time string "HH:MM" to hours and minutes
  const parseTime = (timeStr: string): { hours: number; minutes: number } => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours: hours || 0, minutes: minutes || 0 };
  };

  // Get all unique time slots for tasks on a given day, sorted
  const getUniqueTimeSlotsForDay = (date: Date): string[] => {
    const tasksForDay = getTasksForDay(date);
    const timeSlots = new Set<string>();
    tasksForDay.forEach(task => {
      const time = getTaskTimeSlot(task, date);
      timeSlots.add(time);
    });
    return Array.from(timeSlots).sort((a, b) => {
      const timeA = parseTime(a);
      const timeB = parseTime(b);
      return (timeA.hours * 60 + timeA.minutes) - (timeB.hours * 60 + timeB.minutes);
    });
  };

  // Format time for display
  const formatTimeDisplay = (time: string): string => {
    const { hours } = parseTime(time);
    if (hours < 12) return `🌅 ${time}`;
    if (hours < 18) return `☀️ ${time}`;
    return `🌙 ${time}`;
  };

  const getTaskAssignmentKey = (taskId: string, date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${taskId}_${year}-${month}-${day}`;
  };

  const getTaskAssignment = (taskId: string, date: Date) => {
    const key = getTaskAssignmentKey(taskId, date);
    return taskAssignments[key];
  };

  const isUserBusyAtTime = (userId: string, date: Date, timeSlot: string) => {
    const userEvents = calendarEvents.filter(e => e.userId === userId);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    
    // Parse the time slot (format: "HH:MM")
    const { hours: taskHour, minutes: taskMinutes } = parseTime(timeSlot);
    const taskStartTime = new Date(date);
    taskStartTime.setHours(taskHour, taskMinutes, 0, 0);
    // Assume task duration of ~1 hour for overlap check
    const taskEndTime = new Date(taskStartTime.getTime() + 60 * 60 * 1000);
    
    for (const event of userEvents) {
      const eventStart = new Date(event.start);
      const eventEnd = event.end ? new Date(event.end) : new Date(eventStart.getTime() + 3600000);
      
      // For all-day events, check if the date falls within the event range
      if (event.allDay) {
        const eventStartDate = new Date(eventStart);
        eventStartDate.setHours(0, 0, 0, 0);
        const eventEndDate = new Date(eventEnd);
        eventEndDate.setHours(0, 0, 0, 0);
        
        // Check if checkDate is within the event range (inclusive start, exclusive end for multi-day)
        if (checkDate >= eventStartDate && checkDate < eventEndDate) {
          return true;
        }
        // For single day all-day events
        if (checkDate.getTime() === eventStartDate.getTime()) {
          return true;
        }
        continue;
      }
      
      // For timed events, check if the event overlaps with the task time
      // Event must be on the same day
      if (eventStart.toDateString() !== date.toDateString()) {
        continue;
      }
      
      // Check if event overlaps with task time
      // Overlap occurs when event starts before task ends AND event ends after task starts
      if (eventStart < taskEndTime && eventEnd > taskStartTime) {
        return true;
      }
    }
    
    return false;
  };

  // Check if user has any unavailability during the whole day
  const getUserDayUnavailabilities = (userId: string, date: Date): { time: string; summary: string }[] => {
    const userEvents = calendarEvents.filter(e => e.userId === userId);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    const unavailabilities: { time: string; summary: string }[] = [];
    
    for (const event of userEvents) {
      const eventStart = new Date(event.start);
      const eventEnd = event.end ? new Date(event.end) : new Date(eventStart.getTime() + 3600000);
      
      if (event.allDay) {
        const eventStartDate = new Date(eventStart);
        eventStartDate.setHours(0, 0, 0, 0);
        const eventEndDate = new Date(eventEnd);
        eventEndDate.setHours(0, 0, 0, 0);
        
        if ((checkDate >= eventStartDate && checkDate < eventEndDate) || checkDate.getTime() === eventStartDate.getTime()) {
          unavailabilities.push({ time: 'Toute la journée', summary: event.summary || 'Événement' });
        }
      } else if (eventStart.toDateString() === date.toDateString()) {
        const startStr = eventStart.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const endStr = eventEnd.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        unavailabilities.push({ time: `${startStr} - ${endStr}`, summary: event.summary || 'Événement' });
      }
    }
    
    return unavailabilities;
  };

  const claimTask = async (taskId: string, date: Date) => {
    if (!currentUser) return;
    
    // Find the task to get its time slot
    const task = familyTasks.find(t => t.id === taskId);
    if (task) {
      const timeSlot = getTaskTimeSlot(task, date);
      if (isUserBusyAtTime(currentUser, date, timeSlot)) {
        alert('Vous êtes occupé(e) à cette heure selon votre agenda.');
        return;
      }
    }
    
    const key = getTaskAssignmentKey(taskId, date);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    // Update local state - add user to existing list or create new
    setTaskAssignments(prev => {
      const existing = prev[key];
      const existingUserIds = existing?.userIds || [];
      if (existingUserIds.includes(currentUser)) return prev; // Already assigned
      return {
        ...prev,
        [key]: { date: dateStr, userIds: [...existingUserIds, currentUser] }
      };
    });
    
    // Save to database
    try {
      await fetch('/api/task-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, userId: currentUser, date: dateStr }),
      });
    } catch (error) {
      console.error('Failed to save registration', error);
    }
  };

  const unclaimTask = async (taskId: string, date: Date) => {
    if (!currentUser) return;
    const key = getTaskAssignmentKey(taskId, date);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    // Update local state - remove current user from list
    setTaskAssignments(prev => {
      const existing = prev[key];
      const existingUserIds = existing?.userIds || [];
      const newUserIds = existingUserIds.filter(id => id !== currentUser);
      return {
        ...prev,
        [key]: { date: dateStr, userIds: newUserIds }
      };
    });
    
    // Delete from database
    try {
      await fetch(`/api/task-registrations?taskId=${taskId}&date=${dateStr}&userId=${currentUser}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Failed to delete registration', error);
    }
  };

  // Admin: assigner un membre spécifique à une tâche
  const assignForUser = async (taskId: string, date: Date, userId: string) => {
    const key = getTaskAssignmentKey(taskId, date);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    setTaskAssignments(prev => {
      const existing = prev[key];
      const existingUserIds = existing?.userIds || [];
      if (existingUserIds.includes(userId)) return prev;
      return {
        ...prev,
        [key]: { date: dateStr, userIds: [...existingUserIds, userId] }
      };
    });

    try {
      await fetch('/api/task-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, userId, date: dateStr }),
      });
    } catch (error) {
      console.error('Failed to assign user', error);
    }
  };

  // Admin: désinscrire un membre spécifique d'une tâche
  const unassignForUser = async (taskId: string, date: Date, userId: string) => {
    const key = getTaskAssignmentKey(taskId, date);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    setTaskAssignments(prev => {
      const existing = prev[key];
      const existingUserIds = existing?.userIds || [];
      return {
        ...prev,
        [key]: { date: dateStr, userIds: existingUserIds.filter(id => id !== userId) }
      };
    });

    try {
      await fetch(`/api/task-registrations?taskId=${taskId}&date=${dateStr}&userId=${userId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Failed to unassign user', error);
    }
  };

  const calculateTaskPoints = (task: Task) => {
    // Calcul basé sur la MÉDIANE des évaluations (valeur collective)
    const evals = taskEvaluations.filter(e => e.taskId === task.id);
    
    if (evals.length === 0) {
      // Fallback: utiliser les valeurs par défaut de la tâche
      return Math.round((task.duration * task.penibility) / 10);
    }

    // Calcul des médianes
    const durations = evals.map(e => e.duration).sort((a, b) => a - b);
    const penibilities = evals.map(e => e.penibility).sort((a, b) => a - b);
    
    const medianDuration = durations.length % 2 === 0
      ? (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2
      : durations[Math.floor(durations.length / 2)];
    
    const medianPenibility = penibilities.length % 2 === 0
      ? (penibilities[penibilities.length / 2 - 1] + penibilities[penibilities.length / 2]) / 2
      : penibilities[Math.floor(penibilities.length / 2)];

    return Math.round((medianDuration * medianPenibility) / 10);
  };

  // Détail du calcul pour affichage
  const getPointsBreakdown = (task: Task) => {
    const evals = taskEvaluations.filter(e => e.taskId === task.id);
    
    if (evals.length === 0) {
      return {
        duration: task.duration,
        penibility: task.penibility,
        total: Math.round((task.duration * task.penibility) / 10),
        isMedian: false,
        evalCount: 0
      };
    }

    const durations = evals.map(e => e.duration).sort((a, b) => a - b);
    const penibilities = evals.map(e => e.penibility).sort((a, b) => a - b);
    
    const medianDuration = durations.length % 2 === 0
      ? (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2
      : durations[Math.floor(durations.length / 2)];
    
    const medianPenibility = penibilities.length % 2 === 0
      ? (penibilities[penibilities.length / 2 - 1] + penibilities[penibilities.length / 2]) / 2
      : penibilities[Math.floor(penibilities.length / 2)];

    return {
      duration: Math.round(medianDuration),
      penibility: Math.round(medianPenibility),
      total: Math.round((medianDuration * medianPenibility) / 10),
      isMedian: true,
      evalCount: evals.length
    };
  };

  // Obtenir l'évaluation de l'utilisateur actuel pour une tâche
  const getMyEvaluation = (taskId: string) => {
    if (!currentUser) return null;
    return taskEvaluations.find(e => e.taskId === taskId && e.userId === currentUser) || null;
  };

  // Sauvegarder une évaluation
  const saveEvaluation = async (taskId: string, duration: number, penibility: number) => {
    if (!currentUser) {
      setToastMessage({ type: 'error', text: 'Vous devez être connecté pour évaluer une tâche' });
      return;
    }

    const newEval: TaskEvaluation = { taskId, userId: currentUser, duration, penibility };
    
    // Update local state
    setTaskEvaluations(prev => {
      const existing = prev.findIndex(e => e.taskId === taskId && e.userId === currentUser);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = newEval;
        return updated;
      }
      return [...prev, newEval];
    });

    // Save to database
    try {
      const response = await fetch('/api/task-evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEval),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur serveur');
      }
      
      setToastMessage({ type: 'success', text: 'Évaluation enregistrée !' });
    } catch (error: any) {
      console.error('Failed to save evaluation', error);
      setToastMessage({ type: 'error', text: `Erreur: ${error.message || 'Échec de la sauvegarde'}` });
    }
  };

  // ===== ALGORITHME D'AUTO-ATTRIBUTION INTELLIGENT =====
  
  // Calcul du percentile rank (robuste aux échelles différentes)
  const calculatePercentileRank = (value: number, allValues: number[]): number => {
    if (allValues.length <= 1) return 0.5;
    const sorted = [...allValues].sort((a, b) => a - b);
    const below = sorted.filter(v => v < value).length;
    const equal = sorted.filter(v => v === value).length;
    // Midrank pour ex-aequo
    return (below + equal / 2) / allValues.length;
  };

  // Calcul de l'intensité relative (min-max normalization)
  const calculateRelativeIntensity = (value: number, allValues: number[]): number => {
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    if (max === min) return 0.5; // Fallback si tout est pareil
    return (value - min) / (max - min);
  };

  // Calcul des coûts normalisés pour tous les utilisateurs/tâches
  const calculateNormalizedCosts = (): NormalizedCost[] => {
    const costs: NormalizedCost[] = [];
    const alpha = 0.7; // Poids du rang vs intensité pour pénibilité
    const beta = 0.7;  // Poids du rang vs intensité pour durée

    for (const user of familyUsers) {
      const userEvals = taskEvaluations.filter(e => e.userId === user.id);
      
      // Skip si pas assez d'évaluations (< 3)
      if (userEvals.length < 3) {
        // Fallback: utiliser les valeurs par défaut avec coût médian
        for (const task of familyTasks) {
          costs.push({
            userId: user.id,
            taskId: task.id,
            cost: 0.5, // Coût neutre
            penRank: 0.5,
            durRank: 0.5,
            penRel: 0.5,
            durRel: 0.5
          });
        }
        continue;
      }

      const allPenibilities = userEvals.map(e => e.penibility);
      const allDurations = userEvals.map(e => e.duration);

      for (const task of familyTasks) {
        const eval_ = userEvals.find(e => e.taskId === task.id);
        
        if (!eval_) {
          // Pas d'évaluation pour cette tâche: coût neutre
          costs.push({
            userId: user.id,
            taskId: task.id,
            cost: 0.5,
            penRank: 0.5,
            durRank: 0.5,
            penRel: 0.5,
            durRel: 0.5
          });
          continue;
        }

        // Calcul rang (percentile)
        const penRank = calculatePercentileRank(eval_.penibility, allPenibilities);
        const durRank = calculatePercentileRank(eval_.duration, allDurations);

        // Calcul intensité relative (min-max)
        const penRel = calculateRelativeIntensity(eval_.penibility, allPenibilities);
        const durRel = calculateRelativeIntensity(eval_.duration, allDurations);

        // Fusion rang + intensité
        const penFinal = alpha * penRank + (1 - alpha) * penRel;
        const durFinal = beta * durRank + (1 - beta) * durRel;

        // Coût final (multiplicatif)
        const cost = penFinal * durFinal;

        costs.push({
          userId: user.id,
          taskId: task.id,
          cost,
          penRank,
          durRank,
          penRel,
          durRel
        });
      }
    }

    return costs;
  };

  // Vérifier combien de tâches un utilisateur a évaluées
  const getUserEvaluationCount = (userId: string) => {
    return taskEvaluations.filter(e => e.userId === userId).length;
  };

  // Vérifier si tous les utilisateurs ont évalué toutes les tâches
  const getAllUsersEvaluationStatus = () => {
    return familyUsers.map(user => ({
      userId: user.id,
      userName: user.name,
      evaluated: taskEvaluations.filter(e => e.userId === user.id).length,
      total: familyTasks.length,
      complete: taskEvaluations.filter(e => e.userId === user.id).length >= familyTasks.length
    }));
  };

  const getUserColor = (userId: string) => {
    const member = calendarMembers.find(m => m.id === userId);
    return member?.color || '#3b82f6';
  };

  const getUserName = (userId: string) => {
    const user = familyUsers.find(u => u.id === userId);
    return user?.name || 'Inconnu';
  };

  // Mon Espace functions
  const getMyUpcomingTasks = () => {
    if (!currentUser) return [];
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const upcomingTasks: { task: Task; date: Date; timeSlot: string; points: number }[] = [];
    
    // Check next 7 days
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() + i);
      
      const tasksForDay = getTasksForDay(checkDate);
      tasksForDay.forEach(task => {
        const assignment = getTaskAssignment(task.id, checkDate);
        if (assignment?.userIds?.includes(currentUser)) {
          const timeSlot = getTaskTimeSlot(task, checkDate);
          
          // For today, only include tasks whose time hasn't passed yet
          if (i === 0) {
            const { hours, minutes } = parseTime(timeSlot);
            const taskTime = new Date(checkDate);
            taskTime.setHours(hours, minutes, 0, 0);
            // Skip if task time has already passed (with 30min grace period)
            if (now.getTime() > taskTime.getTime() + 30 * 60 * 1000) {
              return; // This task should go to past tasks
            }
          }
          
          upcomingTasks.push({
            task,
            date: new Date(checkDate),
            timeSlot,
            points: calculateTaskPoints(task)
          });
        }
      });
    }
    
    // Sort by date and time
    return upcomingTasks.sort((a, b) => {
      const dateCompare = a.date.getTime() - b.date.getTime();
      if (dateCompare !== 0) return dateCompare;
      return parseTime(a.timeSlot).hours - parseTime(b.timeSlot).hours;
    });
  };

  const getMyPastTasks = () => {
    if (!currentUser) return [];
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const pastTasks: { task: Task; date: Date; timeSlot: string; points: number; validated: boolean }[] = [];
    
    // First, check today's tasks that have passed their time
    const todayTasks = getTasksForDay(today);
    todayTasks.forEach(task => {
      const assignment = getTaskAssignment(task.id, today);
      if (assignment?.userIds?.includes(currentUser)) {
        const timeSlot = getTaskTimeSlot(task, today);
        const { hours, minutes } = parseTime(timeSlot);
        const taskTime = new Date(today);
        taskTime.setHours(hours, minutes, 0, 0);
        
        // Include if task time has passed (with 30min grace period)
        if (now.getTime() > taskTime.getTime() + 30 * 60 * 1000) {
          const todayYear = today.getFullYear();
          const todayMonth = String(today.getMonth() + 1).padStart(2, '0');
          const todayDay = String(today.getDate()).padStart(2, '0');
          const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;
          const validation = validatedTasks.find(v => v.taskId === task.id && v.date === todayStr);
          pastTasks.push({
            task,
            date: new Date(today),
            timeSlot,
            points: calculateTaskPoints(task),
            validated: validation?.validated ?? false
          });
        }
      }
    });
    
    // Check past 14 days
    for (let i = 1; i <= 14; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      
      const tasksForDay = getTasksForDay(checkDate);
      tasksForDay.forEach(task => {
        const assignment = getTaskAssignment(task.id, checkDate);
        if (assignment?.userIds?.includes(currentUser)) {
          const timeSlot = getTaskTimeSlot(task, checkDate);
          const checkYear = checkDate.getFullYear();
          const checkMonth = String(checkDate.getMonth() + 1).padStart(2, '0');
          const checkDay = String(checkDate.getDate()).padStart(2, '0');
          const checkDateStr = `${checkYear}-${checkMonth}-${checkDay}`;
          const validation = validatedTasks.find(v => v.taskId === task.id && v.date === checkDateStr);
          pastTasks.push({
            task,
            date: new Date(checkDate),
            timeSlot,
            points: calculateTaskPoints(task),
            validated: validation?.validated ?? false
          });
        }
      });
    }
    
    // Sort by date descending (most recent first), then by time descending
    return pastTasks.sort((a, b) => {
      const dateCompare = b.date.getTime() - a.date.getTime();
      if (dateCompare !== 0) return dateCompare;
      return parseTime(b.timeSlot).hours - parseTime(a.timeSlot).hours;
    });
  };

  const validateTask = async (taskId: string, date: Date, validated: boolean) => {
    if (!currentUser) return;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    // Update local state immediately for responsive UI
    setValidatedTasks(prev => {
      const existing = prev.findIndex(v => v.taskId === taskId && v.date === dateStr && v.userId === currentUser);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], validated, validatedAt: new Date().toISOString() };
        return updated;
      }
      return [...prev, { taskId, date: dateStr, userId: currentUser!, validated, validatedAt: new Date().toISOString() }];
    });
    
    // Save to database
    try {
      if (validated) {
        await fetch('/api/task-validations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, userId: currentUser, date: dateStr, validated }),
        });
      } else {
        // If marking as not validated, delete the validation
        await fetch(`/api/task-validations?taskId=${taskId}&date=${dateStr}`, {
          method: 'DELETE',
        });
      }
    } catch (error) {
      console.error('Failed to save validation', error);
    }
  };

  // Delegate task to another user or mark as nobody did it
  const delegateTask = (taskId: string, date: Date, delegatedToUserId: string | null) => {
    if (!currentUser) return;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    setValidatedTasks(prev => {
      // Mark as not done for current user, with delegation info
      const existingIdx = prev.findIndex(v => v.taskId === taskId && v.date === dateStr && v.userId === currentUser);
      const myValidation: ValidatedTask = {
        taskId,
        date: dateStr,
        userId: currentUser!,
        validated: false,
        validatedAt: new Date().toISOString(),
        delegatedTo: delegatedToUserId
      };
      
      let newState = existingIdx >= 0 
        ? prev.map((v, i) => i === existingIdx ? myValidation : v)
        : [...prev, myValidation];
      
      // If delegated to someone, create a pending validation for them
      if (delegatedToUserId) {
        const delegatedValidation: ValidatedTask = {
          taskId,
          date: dateStr,
          userId: delegatedToUserId,
          validated: false, // They need to validate it
          delegatedFrom: currentUser!
        };
        // Check if they already have this task
        const theirExisting = newState.findIndex(v => v.taskId === taskId && v.date === dateStr && v.userId === delegatedToUserId);
        if (theirExisting >= 0) {
          newState = newState.map((v, i) => i === theirExisting ? { ...v, delegatedFrom: currentUser! } : v);
        } else {
          newState = [...newState, delegatedValidation];
        }
      }
      
      return newState;
    });
    
    setDelegationMenu(null);
  };

  // Get tasks delegated to the current user from others
  const getDelegatedToMeTasks = () => {
    if (!currentUser) return [];
    return validatedTasks
      .filter(v => v.userId === currentUser && v.delegatedFrom && !v.validated)
      .map(v => {
        const task = tasks.find(t => t.id === v.taskId);
        if (!task) return null;
        const delegator = users.find(m => m.id === v.delegatedFrom);
        return {
          task,
          date: new Date(v.date),
          validation: v,
          delegatorName: delegator?.name || 'Quelqu\'un'
        };
      })
      .filter(Boolean) as { task: Task; date: Date; validation: ValidatedTask; delegatorName: string }[];
  };

  // Get tasks I delegated to others (for history)
  const getMyDelegatedTasks = () => {
    if (!currentUser) return [];
    return validatedTasks
      .filter(v => v.userId === currentUser && v.delegatedTo !== undefined)
      .map(v => {
        const task = tasks.find(t => t.id === v.taskId);
        if (!task) return null;
        const delegatedPerson = v.delegatedTo ? users.find(m => m.id === v.delegatedTo) : null;
        return {
          task,
          date: new Date(v.date),
          validation: v,
          delegatedToName: delegatedPerson?.name || null
        };
      })
      .filter(Boolean) as { task: Task; date: Date; validation: ValidatedTask; delegatedToName: string | null }[];
  };

  const addExceptionalTask = () => {
    if (!currentUser || !newExceptionalTask.title.trim()) return;
    
    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = String(now.getMonth() + 1).padStart(2, '0');
    const nowDay = String(now.getDate()).padStart(2, '0');
    const todayStr = `${nowYear}-${nowMonth}-${nowDay}`;
    
    const newTask: ExceptionalTask = {
      id: crypto.randomUUID(),
      title: newExceptionalTask.title.trim(),
      duration: newExceptionalTask.duration,
      penibility: newExceptionalTask.penibility,
      date: todayStr,
      userId: currentUser,
      validated: true, // Auto-validated since user just did it
      createdAt: new Date().toISOString()
    };
    
    setExceptionalTasks(prev => [...prev, newTask]);
    setNewExceptionalTask({ title: "", duration: 30, penibility: 30 });
  };

  const getMyExceptionalTasks = () => {
    if (!currentUser) return [];
    return exceptionalTasks
      .filter(t => t.userId === currentUser)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  const deleteExceptionalTask = (taskId: string) => {
    setExceptionalTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const calculateExceptionalPoints = (task: ExceptionalTask) => {
    return Math.round((task.duration * task.penibility) / 10);
  };

  const getMyTotalPoints = () => {
    if (!currentUser) return 0;
    
    // Points from validated regular tasks
    const validatedPoints = validatedTasks
      .filter(v => v.userId === currentUser && v.validated)
      .reduce((sum, v) => {
        const task = familyTasks.find(t => t.id === v.taskId);
        return sum + (task ? calculateTaskPoints(task) : 0);
      }, 0);
    
    // Points from exceptional tasks
    const exceptionalPoints = exceptionalTasks
      .filter(t => t.userId === currentUser && t.validated)
      .reduce((sum, t) => sum + calculateExceptionalPoints(t), 0);
    
    return validatedPoints + exceptionalPoints;
  };

  // Get total points for any user
  const getUserTotalPoints = (userId: string) => {
    // Points from validated regular tasks
    const validatedPoints = validatedTasks
      .filter(v => v.userId === userId && v.validated)
      .reduce((sum, v) => {
        const task = familyTasks.find(t => t.id === v.taskId);
        return sum + (task ? calculateTaskPoints(task) : 0);
      }, 0);
    
    // Points from exceptional tasks
    const exceptionalPoints = exceptionalTasks
      .filter(t => t.userId === userId && t.validated)
      .reduce((sum, t) => sum + calculateExceptionalPoints(t), 0);
    
    return validatedPoints + exceptionalPoints;
  };

  // Get validated tasks count for a user
  const getUserValidatedTasksCount = (userId: string) => {
    return validatedTasks.filter(v => v.userId === userId && v.validated).length +
           exceptionalTasks.filter(t => t.userId === userId && t.validated).length;
  };

  // Get all family members with their points, sorted by points descending
  const getFamilyLeaderboard = () => {
    return familyUsers
      .filter(user => user.participatesInLeaderboard !== false)
      .map(user => ({
        ...user,
        totalPoints: getUserTotalPoints(user.id),
        validatedCount: getUserValidatedTasksCount(user.id)
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);
  };

  // Get max points for progress bar calculation
  const getMaxPoints = () => {
    const leaderboard = getFamilyLeaderboard();
    if (leaderboard.length === 0) return 100;
    return Math.max(leaderboard[0].totalPoints, 100);
  };

  // Obtenir l'historique détaillé des gains d'un utilisateur
  type PointsHistoryItem = {
    id: string;
    type: 'regular' | 'exceptional';
    title: string;
    points: number;
    date: string;
    validatedAt?: string;
  };

  const getUserPointsHistory = (userId: string): PointsHistoryItem[] => {
    const history: PointsHistoryItem[] = [];
    
    // Tâches régulières validées
    validatedTasks
      .filter(v => v.userId === userId && v.validated)
      .forEach(v => {
        const task = familyTasks.find(t => t.id === v.taskId);
        if (task) {
          history.push({
            id: v.taskId + '-' + v.date,
            type: 'regular',
            title: task.title,
            points: calculateTaskPoints(task),
            date: v.date,
            validatedAt: v.validatedAt
          });
        }
      });
    
    // Tâches exceptionnelles
    exceptionalTasks
      .filter(t => t.userId === userId && t.validated)
      .forEach(t => {
        history.push({
          id: t.id,
          type: 'exceptional',
          title: t.title,
          points: calculateExceptionalPoints(t),
          date: t.date,
          validatedAt: t.createdAt
        });
      });
    
    // Trier par date décroissante
    return history.sort((a, b) => {
      const dateA = new Date(a.validatedAt || a.date).getTime();
      const dateB = new Date(b.validatedAt || b.date).getTime();
      return dateB - dateA;
    });
  };

  // === Fonctions d'équité et quota hebdomadaire ===
  
  // Obtenir le lundi d'une semaine donnée
  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Obtenir la clé de semaine (format YYYY-MM-DD du lundi) - en temps local
  const getWeekKey = (date: Date): string => {
    const d = getWeekStart(date);
    return formatLocalDate(d);
  };
  
  // Formater une date en YYYY-MM-DD (temps local, sans décalage UTC)
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Helper pour parser une date YYYY-MM-DD en local (sans décalage UTC)
  const parseLocalDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Calculer le total des points disponibles pour une semaine (toutes les tâches récurrentes × 7 jours)
  const getWeeklyAvailablePoints = (): number => {
    let totalPoints = 0;
    
    // Pour chaque tâche, compter combien de fois elle apparaît dans la semaine
    familyTasks.forEach(task => {
      const schedules = task.schedules && task.schedules.length > 0 ? task.schedules : [task.slot];
      const occurrences = schedules.length; // Nombre de fois par semaine
      const taskPoints = calculateTaskPoints(task);
      totalPoints += taskPoints * occurrences;
    });
    
    return totalPoints;
  };

  // Calculer le quota par personne (points disponibles / nombre de membres actifs)
  const getActiveMembers = () => {
    return familyUsers.filter(user => user.participatesInLeaderboard !== false);
  };

  const getWeeklyQuotaPerPerson = (): number => {
    const totalPoints = getWeeklyAvailablePoints();
    const activeMemberCount = getActiveMembers().length || 1;
    return Math.round(totalPoints / activeMemberCount);
  };

  // Compter le nombre de jours d'absence (événements toute la journée) pour un utilisateur dans une semaine
  const getUserAbsenceDaysForWeek = (userId: string, weekStart: Date): number => {
    const userEvents = calendarEvents.filter(e => e.userId === userId);
    const weekStartTime = weekStart.getTime();
    const weekEndTime = weekStartTime + 7 * 24 * 60 * 60 * 1000;
    
    // Collecter les jours où l'utilisateur est absent toute la journée
    const absentDays = new Set<string>();
    
    for (const event of userEvents) {
      if (!event.allDay) continue; // Seulement les événements toute la journée
      
      const eventStart = new Date(event.start);
      eventStart.setHours(0, 0, 0, 0);
      
      // Pour les événements éclatés (start == end), on ajoute juste ce jour
      // Pour les événements non éclatés, on parcourt de start à end
      const eventEnd = event.end ? new Date(event.end) : new Date(eventStart);
      eventEnd.setHours(0, 0, 0, 0);
      
      // Si start == end (événement d'un seul jour ou éclaté), ajouter ce jour
      if (eventStart.getTime() === eventEnd.getTime()) {
        const dayTime = eventStart.getTime();
        if (dayTime >= weekStartTime && dayTime < weekEndTime) {
          absentDays.add(formatLocalDate(eventStart));
        }
      } else {
        // Événement multi-jours non éclaté (ne devrait plus arriver)
        // Parcourir chaque jour de l'événement
        const currentDay = new Date(eventStart);
        while (currentDay < eventEnd) {
          const dayTime = currentDay.getTime();
          if (dayTime >= weekStartTime && dayTime < weekEndTime) {
            absentDays.add(formatLocalDate(currentDay));
          }
          currentDay.setDate(currentDay.getDate() + 1);
        }
      }
    }
    
    return absentDays.size;
  };

  // Calculer le quota ajusté pour les absences (quota × jours présents / 7)
  const getQuotaWithAbsences = (userId: string, weekStart: Date): number => {
    const baseQuota = getWeeklyQuotaPerPerson();
    const absenceDays = getUserAbsenceDaysForWeek(userId, weekStart);
    const presentDays = 7 - absenceDays;
    return Math.round(baseQuota * presentDays / 7);
  };

  // Obtenir les points gagnés par un utilisateur pour une semaine donnée
  const getUserPointsForWeek = (userId: string, weekStart: Date): number => {
    const weekStartTime = weekStart.getTime();
    const weekEndTime = weekStartTime + 7 * 24 * 60 * 60 * 1000;
    
    // Points des tâches validées cette semaine
    const validatedPoints = validatedTasks
      .filter(v => {
        if (v.userId !== userId || !v.validated) return false;
        // Parser la date en temps local (pas UTC) pour éviter le décalage de timezone
        const [year, month, day] = v.date.split('-').map(Number);
        const taskDate = new Date(year, month - 1, day).getTime();
        return taskDate >= weekStartTime && taskDate < weekEndTime;
      })
      .reduce((sum, v) => {
        const task = familyTasks.find(t => t.id === v.taskId);
        return sum + (task ? calculateTaskPoints(task) : 0);
      }, 0);
    
    // Points des tâches exceptionnelles cette semaine
    const exceptionalPoints = exceptionalTasks
      .filter(t => {
        if (t.userId !== userId || !t.validated) return false;
        // Parser la date en temps local (pas UTC) pour éviter le décalage de timezone
        const [year, month, day] = t.date.split('-').map(Number);
        const taskDate = new Date(year, month - 1, day).getTime();
        return taskDate >= weekStartTime && taskDate < weekEndTime;
      })
      .reduce((sum, t) => sum + calculateExceptionalPoints(t), 0);
    
    return validatedPoints + exceptionalPoints;
  };

  // Obtenir l'historique d'un utilisateur pour la semaine précédente
  // IMPORTANT: On ne reporte PAS de dette si la personne n'a pas participé (0 points)
  // On reporte seulement les SURPLUS (si la personne a fait plus que son quota)
  const getLastWeekBalance = (userId: string): number => {
    const lastWeekStart = getWeekStart(new Date());
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    
    const history = weeklyHistory.find(
      h => h.userId === userId && h.weekStart === formatLocalDate(lastWeekStart)
    );
    
    let pointsEarned: number;
    let quotaWithAbsences: number;
    
    if (history) {
      pointsEarned = history.pointsEarned;
      quotaWithAbsences = history.quota;
    } else {
      // Calculer si pas dans l'historique (avec prise en compte des absences)
      pointsEarned = getUserPointsForWeek(userId, lastWeekStart);
      quotaWithAbsences = getQuotaWithAbsences(userId, lastWeekStart);
    }
    
    const balance = pointsEarned - quotaWithAbsences;
    
    // Si la personne n'a pas participé (0 points), pas de dette reportée
    // On reporte seulement les surplus (balance positive)
    if (pointsEarned === 0) {
      return 0; // Pas de dette si pas de participation
    }
    
    // Si balance positive (surplus), on le reporte pour réduire le quota suivant
    // Si balance négative (dette), on la reporte aussi car la personne a participé mais pas assez
    return balance;
  };

  // Calculer le quota ajusté pour cette semaine (quota avec absences - surplus de la semaine dernière)
  const getAdjustedQuota = (userId: string): number => {
    const currentWeekStart = getWeekStart(new Date());
    const quotaWithAbsences = getQuotaWithAbsences(userId, currentWeekStart);
    const lastWeekBalance = getLastWeekBalance(userId);
    // Si j'ai fait +50 points la semaine dernière, mon quota cette semaine est réduit de 50
    // Si j'ai fait -50 points (dette car j'ai participé mais pas assez), mon quota augmente
    // Si je n'ai pas participé (0 points), pas de dette donc quota normal
    return Math.max(0, quotaWithAbsences - lastWeekBalance);
  };

  // Points restants à faire cette semaine pour atteindre le quota ajusté
  const getRemainingQuota = (userId: string): number => {
    const adjustedQuota = getAdjustedQuota(userId);
    const currentWeekStart = getWeekStart(new Date());
    const pointsThisWeek = getUserPointsForWeek(userId, currentWeekStart);
    return Math.max(0, adjustedQuota - pointsThisWeek);
  };

  // Obtenir le statut d'équité pour affichage
  const getEquityStatus = (userId: string): { status: 'ahead' | 'behind' | 'ontrack'; diff: number } => {
    const currentWeekStart = getWeekStart(new Date());
    const pointsThisWeek = getUserPointsForWeek(userId, currentWeekStart);
    const adjustedQuota = getAdjustedQuota(userId);
    const diff = pointsThisWeek - adjustedQuota;
    
    if (diff > 20) return { status: 'ahead', diff };
    if (diff < -20) return { status: 'behind', diff };
    return { status: 'ontrack', diff };
  };

  // Sauvegarder l'historique de la semaine (à appeler en fin de semaine)
  const saveWeeklyHistory = () => {
    const currentWeekStart = getWeekStart(new Date());
    const weekKey = formatLocalDate(currentWeekStart);
    const quota = getWeeklyQuotaPerPerson();
    
    const newHistory: WeeklyHistory[] = familyUsers.map(user => {
      const pointsEarned = getUserPointsForWeek(user.id, currentWeekStart);
      return {
        weekStart: weekKey,
        userId: user.id,
        pointsEarned,
        quota,
        balance: pointsEarned - quota
      };
    });
    
    setWeeklyHistory(prev => {
      // Remplacer les entrées existantes pour cette semaine
      const filtered = prev.filter(h => h.weekStart !== weekKey);
      return [...filtered, ...newHistory];
    });
  };

  // Family edit/delete functions
  function startEditFamily(familyId: string) {
    setEditFamilyId(familyId);
    const fam = families.find((f: Family) => f.id === familyId);
    setEditFamilyName(fam?.name ?? "");
  }

  function saveEditFamily() {
    if (!editFamilyId || !editFamilyName.trim()) return;
    
    const updateFamilyInDB = async () => {
      try {
        const res = await fetch("/api/families", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editFamilyId,
            name: editFamilyName.trim(),
          }),
        });

        if (res.ok) {
          setFamilies((prev: Family[]) => prev.map((f: Family) => f.id === editFamilyId ? { ...f, name: editFamilyName.trim() } : f));
          setEditFamilyId("");
          setEditFamilyName("");
        }
      } catch (error) {
        console.error("Failed to update family", error);
      }
    };
    
    updateFamilyInDB();
  }

  function deleteFamily(familyId: string) {
    const deleteFamilyInDB = async () => {
      try {
        const res = await fetch(`/api/families?id=${familyId}`, {
          method: "DELETE",
        });

        if (res.ok) {
          setFamilies((prev: Family[]) => prev.filter((f: Family) => f.id !== familyId));
          if (selectedFamily === familyId) setSelectedFamily(families.find(f => f.id !== familyId)?.id ?? "");
          if (editFamilyId === familyId) {
            setEditFamilyId("");
            setEditFamilyName("");
          }
          setParamMessage("Famille supprimée");
        } else {
          setParamMessage("Erreur lors de la suppression");
        }
      } catch (error) {
        console.error("Failed to delete family", error);
        setParamMessage("Erreur lors de la suppression");
      }
    };
    
    deleteFamilyInDB();
  }

  useEffect(() => {
    const authParam = searchParams?.get("auth");
    if (authParam === "signup") setAuthView("signup");
    if (authParam === "login") setAuthView("login");
  }, [searchParams]);

  // Load families and tasks from database when user logs in
  useEffect(() => {
    if (!currentUser) return;
    
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // Load families
        const familiesRes = await fetch(`/api/families?userId=${currentUser}`);
        if (familiesRes.ok) {
          const familiesData = await familiesRes.json();
          const mappedFamilies = familiesData.map((f: any) => ({ id: f.id, name: f.name, code: f.code || "" }));
          setFamilies(mappedFamilies);
          
          // Extract members from families and add to users
          const allMembers: User[] = [];
          for (const family of familiesData) {
            if (family.members) {
              for (const membership of family.members) {
                if (membership.user) {
                  const existingIdx = allMembers.findIndex(u => u.id === membership.user.id);
                  const memberUser: User = {
                    id: membership.user.id,
                    name: membership.user.name || membership.user.email,
                    firstName: membership.user.name?.split(' ')[0],
                    lastName: membership.user.name?.split(' ').slice(1).join(' '),
                    email: membership.user.email,
                    points: membership.user.points || 0,
                    unavailable: [],
                    familyId: family.id,
                    isAdmin: membership.role === 'admin',
                    participatesInLeaderboard: membership.participatesInLeaderboard !== false,
                    participatesInAutoAssign: membership.participatesInAutoAssign !== false,
                  };
                  if (existingIdx < 0) {
                    allMembers.push(memberUser);
                  }
                }
              }
            }
          }
          
          // Update users state with members
          if (allMembers.length > 0) {
            setUsers(prev => {
              const newUsers = [...prev];
              for (const member of allMembers) {
                const existingIdx = newUsers.findIndex(u => u.id === member.id);
                if (existingIdx >= 0) {
                  newUsers[existingIdx] = { ...newUsers[existingIdx], ...member };
                } else {
                  newUsers.push(member);
                }
              }
              return newUsers;
            });
          }
          
          // Set selected family - always ensure it's valid
          if (familiesData.length > 0) {
            const validFamily = familiesData.find((f: any) => f.id === selectedFamily);
            if (!validFamily) {
              // Current selection is invalid, select the first family
              setSelectedFamily(familiesData[0].id);
            }
          } else {
            setSelectedFamily("");
          }
          
          // Load tasks for each family
          if (familiesData.length > 0) {
            const allTasks: any[] = [];
            for (const family of familiesData) {
              const tasksRes = await fetch(`/api/tasks?familyId=${family.id}`);
              if (tasksRes.ok) {
                const tasksData = await tasksRes.json();
                allTasks.push(...tasksData);
              }
            }
            
            const mappedTasks = allTasks.map((t: any) => ({
              id: t.id,
              title: t.title,
              duration: t.duration,
              penibility: t.penibility,
              slot: t.slot,
              schedules: t.frequency ? JSON.parse(t.frequency) : [t.slot],
              familyId: t.familyId,
            }));
            setTasks(mappedTasks);
            
            // Load task registrations (inscriptions)
            for (const family of familiesData) {
              const registrationsRes = await fetch(`/api/task-registrations?familyId=${family.id}`);
              if (registrationsRes.ok) {
                const registrationsData = await registrationsRes.json();
                const newAssignments: Record<string, { date: string; userIds: string[] }> = {};
                for (const reg of registrationsData) {
                  const key = `${reg.taskId}_${reg.date}`;  // Use underscore to match getTaskAssignmentKey
                  // Group by key to collect all userIds
                  if (!newAssignments[key]) {
                    newAssignments[key] = { date: reg.date, userIds: [] };
                  }
                  if (reg.userId && !newAssignments[key].userIds.includes(reg.userId)) {
                    newAssignments[key].userIds.push(reg.userId);
                  }
                }
                setTaskAssignments(prev => ({ ...prev, ...newAssignments }));
              }
            }
            
            // Load task validations
            for (const family of familiesData) {
              const validationsRes = await fetch(`/api/task-validations?familyId=${family.id}`);
              if (validationsRes.ok) {
                const validationsData = await validationsRes.json();
                const loadedValidations: ValidatedTask[] = validationsData.map((v: any) => ({
                  taskId: v.taskId,
                  userId: v.userId,
                  date: v.date,
                  validated: v.validated,
                  validatedAt: v.createdAt || v.validatedAt, // Include timestamp for history
                }));
                setValidatedTasks(prev => {
                  // Merge without duplicates
                  const existing = new Set(prev.map(v => `${v.taskId}-${v.date}`));
                  const newOnes = loadedValidations.filter(v => !existing.has(`${v.taskId}-${v.date}`));
                  return [...prev, ...newOnes];
                });
              }
            }

            // Load task evaluations (évaluations personnelles)
            for (const family of familiesData) {
              const evaluationsRes = await fetch(`/api/task-evaluations?familyId=${family.id}`);
              if (evaluationsRes.ok) {
                const evaluationsData = await evaluationsRes.json();
                const loadedEvaluations: TaskEvaluation[] = evaluationsData.map((e: any) => ({
                  taskId: e.taskId,
                  userId: e.userId,
                  duration: e.duration,
                  penibility: e.penibility,
                }));
                setTaskEvaluations(prev => {
                  const existing = new Set(prev.map(e => `${e.taskId}-${e.userId}`));
                  const newOnes = loadedEvaluations.filter(e => !existing.has(`${e.taskId}-${e.userId}`));
                  return [...prev, ...newOnes];
                });
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to load data", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [currentUser]);

  // Load calendar data when family changes
  useEffect(() => {
    if (selectedFamily) {
      loadCalendarData();
    }
  }, [selectedFamily]);

  const familyUsers = useMemo(
    () => users.filter((u) => u.familyId === selectedFamily),
    [users, selectedFamily]
  );

  const familyTasks = useMemo(() => tasks.filter(t => t.familyId === selectedFamily), [tasks, selectedFamily]);

  // Auto-save last week's history when we have the data and it's missing
  useEffect(() => {
    if (!selectedFamily || familyUsers.length === 0 || familyTasks.length === 0) return;
    
    const lastWeekStart = getWeekStart(new Date());
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekKey = formatLocalDate(lastWeekStart);
    
    // Check if we already have history for last week
    const hasLastWeekHistory = weeklyHistory.some(h => h.weekStart === lastWeekKey);
    
    if (!hasLastWeekHistory) {
      // Save last week's data with the CURRENT quota (best we can do)
      const quota = getWeeklyQuotaPerPerson();
      const newEntries: WeeklyHistory[] = familyUsers.map(user => {
        const pointsEarned = getUserPointsForWeek(user.id, lastWeekStart);
        const quotaWithAbsences = getQuotaWithAbsences(user.id, lastWeekStart);
        return {
          weekStart: lastWeekKey,
          userId: user.id,
          pointsEarned,
          quota: quotaWithAbsences, // Use quota adjusted for absences
          balance: pointsEarned - quotaWithAbsences
        };
      });
      
      setWeeklyHistory(prev => [...prev, ...newEntries]);
    } else {
      // Auto-update if calculated points differ from stored history
      familyUsers.forEach(user => {
        const existingHistory = weeklyHistory.find(h => h.userId === user.id && h.weekStart === lastWeekKey);
        if (existingHistory) {
          const calculatedPoints = getUserPointsForWeek(user.id, lastWeekStart);
          if (calculatedPoints !== existingHistory.pointsEarned) {
            // Update with new calculated points
            setWeeklyHistory(prev => {
              const filtered = prev.filter(h => !(h.userId === user.id && h.weekStart === lastWeekKey));
              return [...filtered, {
                weekStart: lastWeekKey,
                userId: user.id,
                pointsEarned: calculatedPoints,
                quota: existingHistory.quota,
                balance: calculatedPoints - existingHistory.quota
              }];
            });
          }
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily, familyUsers.length, familyTasks.length, validatedTasks.length]);

  const currentUserRecord = useMemo(() => users.find((u) => u.id === currentUser), [users, currentUser]);
  const currentFamilyId = currentUserRecord?.familyId;
  const currentFamily = useMemo(() => families.find((f) => f.id === currentFamilyId), [families, currentFamilyId]);

  const computedAssignments = useMemo(() => {
    const map = new Map<string, string>();
    assignments.forEach((a) => map.set(a.taskId, a.userId));
    return map;
  }, [assignments]);

  // Vérifie si toutes les tâches jusqu'à dimanche sont déjà assignées
  const isAllWeekAssigned = useMemo(() => {
    if (familyTasks.length === 0) return false;
    let hasAnyTask = false;
    // Plage lundi-dimanche
    const todayDow = new Date().getDay(); // 0=Dim, 1=Lun... 6=Sam
    const startOffset = todayDow === 0 ? 1 : 0;
    const endOffset = todayDow === 0 ? 7 : (7 - todayDow);
    for (let dayOffset = startOffset; dayOffset <= endOffset; dayOffset++) {
      const date = new Date();
      date.setDate(date.getDate() + dayOffset);
      date.setHours(0, 0, 0, 0);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const tasksForDay = getTasksForDay(date);
      for (const task of tasksForDay) {
        hasAnyTask = true;
        const key = `${task.id}_${dateStr}`;
        const existing = taskAssignments[key];
        if (!existing || existing.userIds.length === 0) return false;
      }
    }
    return hasAnyTask;
  }, [familyTasks, taskAssignments]);

  function addFamily() {
    setParamMessage("");
    if (!newFamilyName.trim()) {
      setParamMessage("Nom de famille requis");
      return;
    }
    if (!currentUser) {
      setParamMessage("Vous devez être connecté pour créer une famille");
      return;
    }
    
    const createFamilyInDB = async () => {
      try {
        const res = await fetch("/api/families", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newFamilyName.trim(),
            userId: currentUser,
          }),
        });

        if (res.ok) {
          const newFamily = await res.json();
          setFamilies((prev) => [...prev, { id: newFamily.id, name: newFamily.name, code: newFamily.code }]);
          setSelectedFamily(newFamily.id);
          setNewFamilyName("");
          setNewAccount((a) => ({ ...a, familyId: newFamily.id }));
          
          // Update or add current user to users list with the new family
          setUsers((prev) => {
            const existingIdx = prev.findIndex(u => u.id === currentUser);
            if (existingIdx >= 0) {
              // Update existing user
              const updated = [...prev];
              updated[existingIdx] = { ...updated[existingIdx], familyId: newFamily.id, isAdmin: true };
              return updated;
            } else {
              // Add user if not found (get from newFamily.members)
              const memberData = newFamily.members?.find((m: any) => m.userId === currentUser);
              if (memberData?.user) {
                return [...prev, {
                  id: memberData.user.id,
                  name: memberData.user.name || memberData.user.email,
                  email: memberData.user.email,
                  points: memberData.user.points || 0,
                  unavailable: [],
                  familyId: newFamily.id,
                  isAdmin: true,
                }];
              }
              return prev;
            }
          });
          setParamMessage("Famille créée avec le code: " + newFamily.code);
        } else {
          const errData = await res.json();
          setParamMessage("Erreur: " + (errData.error || "Échec de la création"));
        }
      } catch (error) {
        console.error("Failed to create family", error);
        setParamMessage("Erreur lors de la création de la famille");
      }
    };
    
    createFamilyInDB();
  }

  function addUser() {
    setAddUserMessage("");
    if (!newUserEmail.trim()) {
      setAddUserMessage("Email requis");
      return;
    }
    const email = newUserEmail.trim().toLowerCase();
    const first = newUserFirst.trim();
    const last = newUserLast.trim();
    const fullName = makeFullName(first, last, "");

    let found = false;
    const user = users.find((u) => (u.email ?? "").toLowerCase() === email);
    
    if (!user) {
      setAddUserMessage("Utilisateur introuvable (vérifiez l'email)");
      return;
    }
    
    const addUserToFamily = async () => {
      try {
        const res = await fetch("/api/memberships", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            familyId: selectedFamily,
            role: "member",
          }),
        });

        if (res.ok) {
          setUsers((prev) =>
            prev.map((u) =>
              u.id === user.id
                ? {
                    ...u,
                    name: fullName || u.name,
                    firstName: first || u.firstName,
                    lastName: last || u.lastName,
                    familyId: selectedFamily,
                    isAdmin: false,
                  }
                : u
            )
          );
          setAddUserMessage("Membre ajouté à la famille");
          setNewUserFirst("");
          setNewUserLast("");
          setNewUserEmail("");
        }
      } catch (error) {
        console.error("Failed to add user to family", error);
        setAddUserMessage("Erreur lors de l'ajout du membre");
      }
    };
    
    addUserToFamily();
  }

  function mergeAuthUser(user: { id: string; name: string; email: string; familyIds?: string[]; points?: number }, family?: Family) {
    setUsers((prev) => {
      const exists = prev.find((u) => u.id === user.id || u.email === user.email);
      if (exists) return prev.map((u) => (u.id === exists.id ? { ...u, ...user, name: user.name, firstName: u.firstName, lastName: u.lastName, isAdmin: u.isAdmin } : u));
      const fallbackFamily = user.familyIds?.[0] ?? family?.id ?? selectedFamily;
      return [...prev, { id: user.id, name: user.name, email: user.email, points: user.points ?? 0, unavailable: [], familyId: fallbackFamily, isAdmin: false }];
    });

    if (family) {
      setFamilies((prev) => {
        if (prev.some((f) => f.id === family.id)) return prev;
        return [...prev, family];
      });
      setSelectedFamily(family.id);
    } else if (user.familyIds?.[0]) {
      setSelectedFamily(user.familyIds[0]);
    }
  }

  useEffect(() => {
    const raw = window.localStorage.getItem("sessionUser");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { id: string; name: string; email: string; familyIds?: string[]; points?: number };
      mergeAuthUser(parsed);
      setCurrentUser(parsed.id);
      setSelectedUser(parsed.id);
      if (parsed.familyIds?.[0]) setSelectedFamily(parsed.familyIds[0]);
    } catch (e) {
      console.warn("session parse", e);
      window.localStorage.removeItem("sessionUser");
    }
  }, []);

  async function createAccount() {
    if (!newAccount.name.trim() || !newAccount.email.trim() || !newAccount.password.trim()) {
      setAuthError("Nom, email et mot de passe requis");
      return;
    }
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newAccount.name.trim(),
          email: newAccount.email.trim(),
          password: newAccount.password,
          familyName: families.find((f) => f.id === newAccount.familyId)?.name ?? "Famille",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAuthError(data?.error || "Erreur d'inscription");
        setAuthMessage("");
        return;
      }

      const { user, family } = data;
      mergeAuthUser(user, family);
      setCurrentUser(user.id);
      setSelectedUser(user.id);
      setNewAccount({ name: "", email: "", password: "", familyId: family?.id ?? selectedFamily });
      setAuthView("login");
      setAuthMessage("Compte créé et connecté.");
      setAuthError("");
      window.localStorage.setItem("sessionUser", JSON.stringify(user));
    } catch (error) {
      console.error("signup", error);
      setAuthError("Erreur réseau");
    }
  }

  async function login(emailArg?: string, passwordArg?: string) {
    const email = (emailArg ?? authEmail).trim().toLowerCase();
    const pwd = (passwordArg ?? authPassword).trim();
    if (!email || !pwd) {
      setAuthError("Email et mot de passe requis");
      return;
    }
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pwd }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data?.error || "Échec de connexion");
        setAuthMessage("");
        return;
      }
      const { user } = data;
      mergeAuthUser(user);
      setCurrentUser(user.id);
      setSelectedUser(user.id);
      setSelectedFamily(user.familyIds?.[0] ?? selectedFamily);
      setAuthError("");
      setAuthMessage(`Connecté en tant que ${user.name}.`);
      window.localStorage.setItem("sessionUser", JSON.stringify(user));
    } catch (error) {
      console.error("login", error);
      setAuthError("Erreur réseau");
    }
  }

  function logout() {
    setCurrentUser(null);
    setSelectedUser("");
    setAuthEmail("");
    setAuthPassword("");
    setAuthMessage("");
    setAuthError("");
    window.localStorage.removeItem("sessionUser");
    router.replace("/");
  }

  function joinFamily(userId: string, familyId: string) {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, familyId } : u)));
  }

  function joinFamilyByName() {
    setParamMessage("");
    if (!joinFamilyName.trim()) {
      setParamMessage("Nom de famille requis");
      return;
    }
    const found = families.find((f) => f.name.toLowerCase() === joinFamilyName.trim().toLowerCase());
    if (!found) {
      setParamMessage("Famille introuvable");
      return;
    }
    
    if (currentUser) {
      const joinFamilyInDB = async () => {
        try {
          const res = await fetch("/api/memberships", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: currentUser,
              familyId: found.id,
              role: "member",
            }),
          });

          if (res.ok) {
            setSelectedFamily(found.id);
            setUsers((prev) => prev.map((u) => (u.id === currentUser ? { ...u, familyId: found.id } : u)));
            setJoinFamilyName("");
          }
        } catch (error) {
          console.error("Failed to join family", error);
        }
      };
      joinFamilyInDB();
    } else {
      setSelectedFamily(found.id);
      setParamMessage("Famille sélectionnée (non connecté)");
      setJoinFamilyName("");
    }
  }

  function joinFamilyByCode() {
    setParamMessage("");
    if (!joinFamilyCode.trim()) {
      setParamMessage("Code de famille requis");
      return;
    }
    
    if (!currentUser) {
      setParamMessage("Vous devez être connecté");
      return;
    }

    const joinFamilyInDB = async () => {
      try {
        const res = await fetch("/api/families/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: joinFamilyCode.trim(),
            userId: currentUser,
          }),
        });

        if (res.ok) {
          const membership = await res.json();
          setSelectedFamily(membership.familyId);
          setUsers((prev) => prev.map((u) => (u.id === currentUser ? { ...u, familyId: membership.familyId } : u)));
          
          // Reload families
          const famRes = await fetch("/api/families");
          if (famRes.ok) {
            const fams = await famRes.json();
            setFamilies(fams);
          }
          
          setJoinFamilyCode("");
          setParamMessage("Famille rejointe!");
        } else {
          const data = await res.json();
          setParamMessage(data.error || "Erreur lors de la connexion");
        }
      } catch (error) {
        console.error("Failed to join family by code", error);
        setParamMessage("Erreur lors de la connexion");
      }
    };
    joinFamilyInDB();
  }

  function leaveFamily() {
    setParamMessage("");
    if (!currentUser || !currentFamily) {
      setParamMessage("Sélectionnez une famille à quitter");
      return;
    }
    
    const leaveFamilyInDB = async () => {
      try {
        const res = await fetch(`/api/memberships?userId=${currentUser}&familyId=${currentFamily}`, {
          method: "DELETE",
        });

        if (res.ok) {
          // Retirer la famille de la liste locale
          setFamilies((prev) => prev.filter((f: any) => f.id !== currentFamily));
          setUsers((prev) => prev.map((u) => (u.id === currentUser ? { ...u, familyId: undefined } : u)));
          
          // Sélectionner une autre famille si disponible
          const remainingFamilies = families.filter((f: any) => f.id !== currentFamily);
          setSelectedFamily(remainingFamilies[0]?.id ?? "");
          setParamMessage("Vous avez quitté la famille");
        } else {
          setParamMessage("Erreur lors de la suppression");
        }
      } catch (error) {
        console.error("Failed to leave family", error);
        setParamMessage("Erreur lors de la suppression");
      }
    };
    
    leaveFamilyInDB();
  }

  function addNewTaskSchedule() {
    const entry = `${newTaskDay} · ${newTaskTime}`;
    setNewTaskSchedules((prev) => Array.from(new Set([...prev, entry])));
  }

  function removeNewTaskSchedule(entry: string) {
    setNewTaskSchedules((prev) => prev.filter((s) => s !== entry));
  }

  function addTask() {
    if (!selectedFamily) {
      setParamMessage("Créez ou rejoignez une famille d'abord pour ajouter des tâches");
      return;
    }
    if (!newTask.title.trim()) {
      setParamMessage("Titre de tâche requis");
      return;
    }
    setParamMessage("");
    const scheduleList = newTaskSchedules.length ? newTaskSchedules : [`${newTaskDay} · ${newTaskTime}`];
    
    const createTaskInDB = async () => {
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newTask.title.trim(),
            duration: newTask.duration,
            penibility: newTask.penibility,
            slot: scheduleList[0],
            schedules: scheduleList,
            familyId: selectedFamily,
          }),
        });

        if (res.ok) {
          const createdTask = await res.json();
          setTasks((prev) => [...prev, {
            id: createdTask.id,
            title: createdTask.title,
            duration: createdTask.duration,
            penibility: createdTask.penibility,
            slot: createdTask.slot,
            schedules: scheduleList,
            familyId: createdTask.familyId,
          }]);
          setNewTask({ title: "", duration: 30, penibility: 30 });
          setNewTaskDay(dayOptions[0]);
          setNewTaskTime("08:00");
          setNewTaskSchedules([]);
        } else {
          const errData = await res.json();
          alert("Erreur: " + (errData.error || "Échec création"));
        }
      } catch (error) {
        console.error("Failed to create task", error);
        alert("Erreur lors de la création de la tâche");
      }
    };
    
    createTaskInDB();
  }

  function deleteTask(taskId: string) {
    const deleteTaskInDB = async () => {
      try {
        const res = await fetch(`/api/tasks?id=${taskId}`, {
          method: "DELETE",
        });

        if (res.ok) {
          setTasks((prev) => prev.filter((t) => t.id !== taskId));
          setAssignments((prev) => prev.filter((a) => a.taskId !== taskId));
          if (editingTaskId === taskId) {
            setEditingTaskId(null);
          }
        } else {
          const errData = await res.json();
          alert("Erreur: " + (errData.error || "Échec suppression"));
        }
      } catch (error) {
        console.error("Failed to delete task", error);
        alert("Erreur lors de la suppression");
      }
    };
    
    deleteTaskInDB();
  }

  function startEditTask(task: Task) {
    setEditingTaskId(task.id);
    setEditTaskDraft({
      title: task.title,
      duration: task.duration,
      penibility: task.penibility,
      slot: task.slot || task.schedules?.[0] || daySlots[0],
    });
  }

  function cancelEditTask() {
    setEditingTaskId(null);
  }

  function saveEditTask() {
    if (!editingTaskId) return;
    if (!editTaskDraft.title.trim()) return;
    
    const updateTaskInDB = async () => {
      try {
        const task = tasks.find(t => t.id === editingTaskId);
        const schedules = task?.schedules && task.schedules.length > 0 ? [editTaskDraft.slot, ...task.schedules.slice(1)] : [editTaskDraft.slot];
        
        const res = await fetch("/api/tasks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingTaskId,
            title: editTaskDraft.title.trim(),
            duration: editTaskDraft.duration,
            penibility: editTaskDraft.penibility,
            slot: editTaskDraft.slot,
            schedules,
          }),
        });

        if (res.ok) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === editingTaskId
                ? {
                    ...t,
                    ...editTaskDraft,
                    title: editTaskDraft.title.trim(),
                    schedules,
                  }
                : t
            )
          );
          setEditingTaskId(null);
        }
      } catch (error) {
        console.error("Failed to update task", error);
      }
    };
    
    updateTaskInDB();
  }

  function getScheduleDraft(taskId: string) {
    const current = scheduleDrafts[taskId];
    return current ?? { day: dayOptions[0], time: "08:00" };
  }

  function updateScheduleDraft(taskId: string, patch: Partial<{ day: string; time: string }>) {
    setScheduleDrafts((prev) => {
      const base = prev[taskId] ?? { day: dayOptions[0], time: "08:00" };
      return { ...prev, [taskId]: { ...base, ...patch } };
    });
  }

  function addScheduleToTask(taskId: string) {
    const draft = getScheduleDraft(taskId);
    const entry = `${draft.day} · ${draft.time}`;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const updatedSchedules = Array.from(new Set([...(task.schedules ?? []), entry]));
    
    const updateTaskSchedules = async () => {
      try {
        const res = await fetch("/api/tasks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: taskId,
            schedules: updatedSchedules,
            slot: task.slot || entry,
          }),
        });

        if (res.ok) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    schedules: updatedSchedules,
                    slot: t.slot || entry,
                  }
                : t
            )
          );
          setScheduleDrafts((prev) => {
            const copy = { ...prev };
            delete copy[taskId];
            return copy;
          });
        }
      } catch (error) {
        console.error("Failed to add schedule", error);
      }
    };
    
    updateTaskSchedules();
  }

  function removeScheduleFromTask(taskId: string, entry: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const current = task.schedules ?? [];
    if (current.length <= 1) return;
    const next = current.filter((s) => s !== entry);
    if (!next.length) return;
    const nextSlot = next[0];
    
    const updateTaskSchedules = async () => {
      try {
        const res = await fetch("/api/tasks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: taskId,
            schedules: next,
            slot: nextSlot,
          }),
        });

        if (res.ok) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? { ...t, schedules: next, slot: nextSlot }
                : t
            )
          );
        }
      } catch (error) {
        console.error("Failed to remove schedule", error);
      }
    };
    
    updateTaskSchedules();
  }

  function addUnavailable() {
    if (!newUnavailable.trim() || !selectedUser) return;
    
    const addUnavailableInDB = async () => {
      try {
        const res = await fetch("/api/unavailabilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: selectedUser,
            slot: newUnavailable.trim(),
          }),
        });

        if (res.ok) {
          setUsers((prev) =>
            prev.map((u) =>
              u.id === selectedUser ? { ...u, unavailable: Array.from(new Set([...u.unavailable, newUnavailable.trim()])) } : u
            )
          );
          setNewUnavailable("");
        }
      } catch (error) {
        console.error("Failed to add unavailability", error);
      }
    };
    
    addUnavailableInDB();
  }

  function selectUserToEdit(userId: string) {
    setEditUserId(userId);
    const user = users.find((u) => u.id === userId);
    if (!user) {
      setEditUserDraft({ firstName: "", lastName: "", email: "", password: "" });
      return;
    }
    setEditUserDraft({
      firstName: user.firstName ?? user.name.split(" ")[0] ?? "",
      lastName: user.lastName ?? user.name.split(" ").slice(1).join(" ") ?? "",
      email: user.email ?? "",
      password: "",
    });
  }

  function saveEditUser() {
    setParamMessage("");
    if (!editUserId) {
      setParamMessage("Sélectionnez un membre");
      return;
    }
    if (!editUserDraft.firstName.trim() || !editUserDraft.lastName.trim()) {
      setParamMessage("Prénom et nom requis");
      return;
    }
    const fullName = makeFullName(editUserDraft.firstName, editUserDraft.lastName, "");
    
    const updateUserInDB = async () => {
      try {
        const user = users.find(u => u.id === editUserId);
        if (!user) return;
        
        const updateBody: any = {
          id: editUserId,
          name: fullName,
          email: editUserDraft.email.trim(),
        };
        
        if (editUserDraft.password.trim()) {
          updateBody.password = editUserDraft.password.trim();
        }
        
        const res = await fetch("/api/auth/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateBody),
        });

        if (res.ok) {
          setUsers((prev) =>
            prev.map((u) => {
              if (u.id !== editUserId) return u;
              const password = editUserDraft.password.trim() ? editUserDraft.password.trim() : u.password;
              return {
                ...u,
                name: fullName,
                firstName: editUserDraft.firstName.trim(),
                lastName: editUserDraft.lastName.trim(),
                email: editUserDraft.email.trim(),
                password,
              };
            })
          );
          setParamMessage("Membre mis à jour");
          setEditUserId("");
        } else {
          setParamMessage("Erreur lors de la sauvegarde");
        }
      } catch (error) {
        console.error("Failed to update user", error);
        setParamMessage("Erreur lors de la mise à jour");
      }
    };
    
    updateUserInDB();
  }

  // [1] Historique de rotation : combien de fois chaque user a fait chaque tâche sur 28 jours
  const getRotationHistory = (): Map<string, Map<string, number>> => {
    const history = new Map<string, Map<string, number>>();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 28);

    for (const [key, assignment] of Object.entries(taskAssignments)) {
      const underscoreIndex = key.lastIndexOf('_');
      if (underscoreIndex === -1) continue;
      const dateStr = key.substring(underscoreIndex + 1);
      const taskId = key.substring(0, underscoreIndex);

      const [year, month, day] = dateStr.split('-').map(Number);
      const assignDate = new Date(year, month - 1, day);
      if (assignDate < cutoff || assignDate > now) continue;

      for (const userId of assignment.userIds) {
        if (!history.has(userId)) history.set(userId, new Map());
        const userMap = history.get(userId)!;
        userMap.set(taskId, (userMap.get(taskId) ?? 0) + 1);
      }
    }

    return history;
  };

  function autoAssign() {
    // ===== VÉRIFICATION DES PRÉREQUIS =====
    if (!currentUser) {
      setToastMessage({ type: 'error', text: 'Vous devez être connecté pour utiliser l\'auto-attribution' });
      return;
    }
    
    if (familyUsers.length === 0) {
      setToastMessage({ type: 'error', text: 'Aucun membre dans la famille. Ajoutez des membres dans les réglages.' });
      return;
    }

    // Filtrer les membres qui participent à l'auto-attribution
    const autoAssignUsers = familyUsers.filter(u => u.participatesInAutoAssign !== false);
    if (autoAssignUsers.length === 0) {
      setToastMessage({ type: 'error', text: 'Aucun membre ne participe à l\'auto-attribution. Modifiez les réglages des points.' });
      return;
    }
    
    if (familyTasks.length === 0) {
      setToastMessage({ type: 'error', text: 'Aucune tâche configurée. Créez des tâches dans l\'onglet Tâches.' });
      return;
    }
    
    // Vérifier que TOUS les membres participants ont évalué toutes les tâches
    const evaluationStatus = autoAssignUsers.map(user => ({
      name: user.name,
      evaluated: taskEvaluations.filter(e => e.userId === user.id).length,
      total: familyTasks.length,
    }));
    const incomplete = evaluationStatus.filter(s => s.evaluated < s.total);
    if (incomplete.length > 0) {
      setMissingEvaluationUsers(incomplete);
      setShowAutoAssignError(true);
      return;
    }
    
    // ===== ALGORITHME D'AUTO-ATTRIBUTION INTELLIGENT =====
    // Attribue les tâches jusqu'à dimanche (semaine lundi-dimanche)

    const normalizedCosts = calculateNormalizedCosts();
    const newAssignments: { taskId: string; taskTitle: string; userId: string; userName: string; date: string; key: string; points: number; reason: string }[] = [];

    // Charge actuelle par utilisateur (en points) pour la semaine
    const weeklyLoad = new Map<string, number>();
    autoAssignUsers.forEach((u) => weeklyLoad.set(u.id, 0));

    // Calculer le total des points pour la semaine (toutes les tâches non assignées)
    let totalWeeklyPoints = 0;
    const allUnassignedTasks: { task: Task; date: Date; dateStr: string; key: string; timeSlot: string }[] = [];

    // Plage lundi-dimanche : si dimanche, commence demain (lundi) jusqu'au dimanche suivant
    const todayDow = new Date().getDay(); // 0=Dim, 1=Lun... 6=Sam
    const startOffset = todayDow === 0 ? 1 : 0;
    const endOffset = todayDow === 0 ? 7 : (7 - todayDow);

    for (let dayOffset = startOffset; dayOffset <= endOffset; dayOffset++) {
      const date = new Date();
      date.setDate(date.getDate() + dayOffset);
      date.setHours(0, 0, 0, 0);
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      const tasksForDay = getTasksForDay(date);
      
      tasksForDay.forEach(task => {
        const key = `${task.id}_${dateStr}`;
        const existing = taskAssignments[key];
        const isUnassigned = !existing || existing.userIds.length === 0;
        
        if (isUnassigned) {
          totalWeeklyPoints += calculateTaskPoints(task);
          allUnassignedTasks.push({
            task,
            date,
            dateStr,
            key,
            timeSlot: getTaskTimeSlot(task, date)
          });
        }
      });
    }

    if (allUnassignedTasks.length === 0) {
      setToastMessage({ type: 'error', text: 'Toutes les tâches sont déjà attribuées jusqu\'à dimanche.' });
      return;
    }

    // Quota équitable par personne = total des points / nombre de membres
    const lambda = 2.2; // Multiplicateur de charge (modèle multiplicatif)
    const hardBrake = 2.0; // Pénalité linéaire après dépassement de cible
    const gamma = 0.35; // Pénalité de rotation historique
    const epsilon = 0.05; // Seuil de tie-break stochastique

    // [3] Cible dynamique par utilisateur (pondérée par présence)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const presenceWeights = new Map<string, number>();
    let totalWeight = 0;
    autoAssignUsers.forEach(u => {
      const absenceDays = getUserAbsenceDaysForWeek(u.id, today);
      const weight = Math.max(0.1, (7 - absenceDays) / 7); // minimum 0.1 pour éviter division par 0
      presenceWeights.set(u.id, weight);
      totalWeight += weight;
    });
    const getTargetForUser = (userId: string): number => {
      const weight = presenceWeights.get(userId) || 1;
      return totalWeeklyPoints * (weight / totalWeight);
    };

    // [1] Historique de rotation (4 dernières semaines)
    const rotationHistory = getRotationHistory();

    // Trier les tâches par points décroissants (grosses tâches d'abord pour meilleur équilibrage)
    allUnassignedTasks.sort((a, b) => calculateTaskPoints(b.task) - calculateTaskPoints(a.task));

    allUnassignedTasks.forEach(({ task, date, dateStr, key, timeSlot }) => {
      // Candidats éligibles (non occupés sur ce créneau ce jour)
      const candidates = autoAssignUsers.filter((u) => {
        // Vérifier indisponibilités récurrentes
        if (u.unavailable.includes(timeSlot)) return false;
        // Vérifier calendrier (événements)
        if (isUserBusyAtTime(u.id, date, timeSlot)) return false;
        return true;
      });

      if (!candidates.length) return;

      const taskPoints = calculateTaskPoints(task);

      const scored = candidates.map(user => {
        const costEntry = normalizedCosts.find(c => c.userId === user.id && c.taskId === task.id);
        const personalCost = costEntry?.cost ?? 0.5;

        // Bonus préférence forte : amplifier les vraies préférences (coût < 0.2)
        const adjustedCost = personalCost < 0.2 ? personalCost * 0.7 : personalCost;

        const userLoad = weeklyLoad.get(user.id) ?? 0;
        const userTarget = getTargetForUser(user.id);

        // Charge projetée et ratio
        const projectedLoad = userLoad + taskPoints;
        const loadRatio = userTarget > 0 ? projectedLoad / userTarget : 0;

        // Modèle MULTIPLICATIF : la charge multiplie le coût, ne l'écrase pas
        const chargeMultiplier = 1 + lambda * (loadRatio ** 2);
        let baseScore = adjustedCost * chargeMultiplier;

        // Hard brake : pénalité linéaire forte après dépassement de cible
        if (loadRatio > 1) {
          baseScore += hardBrake * (loadRatio - 1);
        }

        // Pénalité de rotation historique (4 dernières semaines)
        const rotationCount = rotationHistory.get(user.id)?.get(task.id) ?? 0;
        const rotationPenalty = gamma * rotationCount;

        // Score final = baseScore + rotation
        const decisionScore = baseScore + rotationPenalty;

        return { user, personalCost, adjustedCost, decisionScore, currentLoad: userLoad, userTarget, loadRatio, chargeMultiplier, rotationCount, rotationPenalty, overTarget: loadRatio > 1 };
      });

      // [2] Tie-break stochastique : si scores proches, tirage aléatoire
      scored.sort((a, b) => a.decisionScore - b.decisionScore);
      const topCandidates = scored.filter(s => s.decisionScore - scored[0].decisionScore < epsilon);
      const picked = topCandidates.length > 1
        ? topCandidates[Math.floor(Math.random() * topCandidates.length)]
        : scored[0];

      weeklyLoad.set(picked.user.id, (weeklyLoad.get(picked.user.id) ?? 0) + taskPoints);

      // Construire la raison détaillée
      const allScoresStr = scored.map(s =>
        `${s.user.name}: score=${s.decisionScore.toFixed(2)} (coût=${s.personalCost.toFixed(2)}${s.adjustedCost !== s.personalCost ? '→' + s.adjustedCost.toFixed(2) : ''}, charge=${Math.round(s.currentLoad)}/${Math.round(s.userTarget)} pts, ratio=${s.loadRatio.toFixed(2)}, ×${s.chargeMultiplier.toFixed(2)}${s.overTarget ? ', FREIN+' + (hardBrake * (s.loadRatio - 1)).toFixed(2) : ''}, rot=${s.rotationCount}×${gamma})`
      ).join(' | ');
      const reason = topCandidates.length > 1
        ? `Tie-break entre ${topCandidates.length} candidats → ${picked.user.name} (aléatoire). [${allScoresStr}]`
        : `Meilleur score. [${allScoresStr}]`;

      newAssignments.push({ taskId: task.id, taskTitle: task.title, userId: picked.user.id, userName: picked.user.name, date: dateStr, key, points: taskPoints, reason });
    });

    if (newAssignments.length === 0) {
      setToastMessage({ type: 'error', text: 'Impossible d\'attribuer : tous les membres sont indisponibles sur les créneaux restants.' });
      return;
    }

    // Calculer la répartition finale pour le message
    const finalDistribution = new Map<string, number>();
    autoAssignUsers.forEach(u => finalDistribution.set(u.id, 0));
    newAssignments.forEach(a => {
      finalDistribution.set(a.userId, (finalDistribution.get(a.userId) ?? 0) + a.points);
    });

    // Sauvegarder les attributions
    const saveAssignments = async () => {
      // Mise à jour locale IMMÉDIATE (avant les appels API)
      setTaskAssignments(prev => {
        const updated = { ...prev };
        for (const assignment of newAssignments) {
          const existing = updated[assignment.key];
          const existingUserIds = existing?.userIds || [];
          if (!existingUserIds.includes(assignment.userId)) {
            updated[assignment.key] = {
              date: assignment.date,
              userIds: [...existingUserIds, assignment.userId],
            };
          }
        }
        return updated;
      });

      // Construire les détails du compte rendu
      const userSummaries = new Map<string, { name: string; tasks: { title: string; day: string; points: number; reason: string }[]; points: number }>();
      autoAssignUsers.forEach(u => userSummaries.set(u.id, { name: u.name, tasks: [], points: 0 }));

      for (const a of newAssignments) {
        const summary = userSummaries.get(a.userId);
        if (summary) {
          const dayLabel = new Date(a.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
          summary.tasks.push({ title: a.taskTitle, day: dayLabel, points: a.points, reason: a.reason });
          summary.points += a.points;
        }
      }

      const details: string[] = [];
      userSummaries.forEach(summary => {
        if (summary.tasks.length > 0) {
          details.push(`── ${summary.name} — ${Math.round(summary.points)} pts ──`);
          summary.tasks.forEach(t => {
            details.push(`  • ${t.title} (${t.day}, ${Math.round(t.points)} pts)`);
            details.push(`    ${t.reason}`);
          });
        }
      });

      // Appels API en arrière-plan
      try {
        let successCount = 0;
        let errorCount = 0;

        for (const assignment of newAssignments) {
          const response = await fetch('/api/task-registrations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: assignment.taskId,
              userId: assignment.userId,
              date: assignment.date
            }),
          });

          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
            console.error('Registration failed:', assignment);
          }
        }

        if (errorCount === 0) {
          setToastMessage({
            type: 'success',
            text: `${successCount} tâches attribuées jusqu'à dimanche (${Math.round(totalWeeklyPoints)} pts répartis)`,
            details
          });
        } else {
          setToastMessage({ type: 'error', text: `${successCount} tâche(s) attribuée(s), mais ${errorCount} ont échoué.` });
        }
      } catch (error) {
        console.error("Failed to save assignments", error);
        setToastMessage({ type: 'error', text: 'Erreur réseau lors de la sauvegarde. Vérifiez votre connexion et réessayez.' });
      }
    };

    saveAssignments();
  }

  // Prévisualisation de l'auto-attribution avant validation
  const previewAutoAssign = () => {
    const normalizedCosts = calculateNormalizedCosts();
    const preview: { task: Task; userId: string; userName: string; cost: number; reason: string }[] = [];

    const currentLoad = new Map<string, number>();
    familyUsers.forEach((u) => currentLoad.set(u.id, 0));

    const totalPoints = familyTasks.reduce((sum, t) => sum + calculateTaskPoints(t), 0);
    const lambda = 3.0;
    const gamma = 0.15;

    // [3] Cible dynamique par utilisateur (pondérée par présence)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const presenceWeights = new Map<string, number>();
    let totalWeight = 0;
    familyUsers.forEach(u => {
      const absenceDays = getUserAbsenceDaysForWeek(u.id, today);
      const weight = Math.max(0.1, (7 - absenceDays) / 7);
      presenceWeights.set(u.id, weight);
      totalWeight += weight;
    });
    const getTargetForUser = (userId: string): number => {
      const weight = presenceWeights.get(userId) || 1;
      return totalPoints * (weight / totalWeight);
    };

    // [1] Historique de rotation
    const rotationHistory = getRotationHistory();

    const sortedTasks = [...familyTasks].sort((a, b) => calculateTaskPoints(b) - calculateTaskPoints(a));

    sortedTasks.forEach((task) => {
      const primarySlot = task.schedules?.[0] ?? task.slot;
      const candidates = familyUsers.filter((u) => !u.unavailable.includes(primarySlot));
      if (!candidates.length) return;

      const taskPoints = calculateTaskPoints(task);

      const scored = candidates.map(user => {
        const costEntry = normalizedCosts.find(c => c.userId === user.id && c.taskId === task.id);
        const personalCost = costEntry?.cost ?? 0.5;
        const userLoad = currentLoad.get(user.id) ?? 0;
        const userTarget = getTargetForUser(user.id);

        // [4] Pénalité progressive
        const projectedLoad = userLoad + taskPoints;
        const loadRatio = userTarget > 0 ? projectedLoad / userTarget : 0;
        const progressivePenalty = loadRatio ** 2;

        // [1] Pénalité de rotation
        const rotationCount = rotationHistory.get(user.id)?.get(task.id) ?? 0;
        const rotationPenalty = gamma * rotationCount;

        const decisionScore = personalCost + lambda * progressivePenalty + rotationPenalty;

        return { user, personalCost, decisionScore, progressivePenalty, rotationCount };
      });

      scored.sort((a, b) => a.decisionScore - b.decisionScore);
      const winner = scored[0];

      currentLoad.set(winner.user.id, (currentLoad.get(winner.user.id) ?? 0) + taskPoints);

      let reason = '';
      if (winner.personalCost < 0.3) {
        reason = 'Trouve cette tâche facile';
      } else if (winner.progressivePenalty < 0.1) {
        reason = 'A de la capacité';
      } else if (winner.rotationCount === 0 && scored.some(s => s.rotationCount > 0)) {
        reason = 'Rotation (alternance)';
      } else if (winner.personalCost < scored[scored.length - 1]?.personalCost - 0.2) {
        reason = 'Préfère cette tâche';
      } else {
        reason = 'Équilibrage de charge';
      }

      preview.push({
        task,
        userId: winner.user.id,
        userName: winner.user.name,
        cost: winner.personalCost,
        reason
      });
    });

    return preview;
  };

  if (!currentUser) {
    return (
      <main className={styles.authShell}>
        <div className={styles.authCard}>
          <div className={styles.authTabs}>
            <button
              className={authView === "login" ? styles.tabActive : styles.tab}
              onClick={() => {
                setAuthView("login");
                setAuthMessage("");
                setAuthError("");
              }}
            >
              Connexion
            </button>
            <button
              className={authView === "signup" ? styles.tabActive : styles.tab}
              onClick={() => {
                setAuthView("signup");
                setAuthMessage("");
                setAuthError("");
              }}
            >
              Inscription
            </button>
          </div>

          {authView === "login" && (
            <div className={styles.formGridSmall}>
              <label className={styles.label}>Email</label>
              <input
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="vous@exemple.com"
              />
              <label className={styles.label}>Mot de passe</label>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="mot de passe"
              />
              <button onClick={() => login()}>Se connecter</button>
            </div>
          )}

          {authView === "signup" && (
            <div className={styles.formGridSmall}>
              <label className={styles.label}>Nom</label>
              <input
                value={newAccount.name}
                onChange={(e) => setNewAccount((a) => ({ ...a, name: e.target.value }))}
                placeholder="Votre nom"
              />
              <label className={styles.label}>Email</label>
              <input
                value={newAccount.email}
                onChange={(e) => setNewAccount((a) => ({ ...a, email: e.target.value }))}
                placeholder="vous@exemple.com"
              />
              <label className={styles.label}>Mot de passe</label>
              <input
                type="password"
                value={newAccount.password}
                onChange={(e) => setNewAccount((a) => ({ ...a, password: e.target.value }))}
                placeholder="mot de passe"
              />
              <button onClick={createAccount}>Créer et entrer</button>
            </div>
          )}

          {authError && <p className={styles.error}>{authError}</p>}
          {authMessage && <p className={styles.success}>{authMessage}</p>}
        </div>
      </main>
    );
  }

  const currentUserEntity = users.find((u) => u.id === currentUser);

  // Content tabs (shared between desktop and mobile)
  const tabContent = (
    <>
      {activeTab === "monespace" && (
        <section className={styles.tabPanel}>
          <div className={styles.cardPanel}>
            <div className={styles.monEspaceHeader}>
              <h3><Icon name="user" size={18} style={{ marginRight: '8px' }} />Mon Espace</h3>
              <div className={styles.myPointsTotal}>
                <span className={styles.pointsLabel}>Mes points</span>
                <span className={styles.pointsValue}>{getMyTotalPoints()} pts</span>
              </div>
            </div>

            {!currentUser ? (
              <p className={styles.mutedSmall} style={{ color: "#ff6b6b", display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon name="warning" size={14} />Connectez-vous pour voir vos tâches
              </p>
            ) : (
              <>
                {/* Prochaines tâches */}
                <div className={styles.monEspaceSection}>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="clipboardList" size={16} />Mes prochaines tâches</h4>
                  <div className={styles.tasksList}>
                    {getMyUpcomingTasks().length === 0 ? (
                      <p className={styles.noTasks}>Aucune tâche à venir. Prenez des tâches dans le Planificateur !</p>
                    ) : (
                      getMyUpcomingTasks().map((item, idx) => (
                        <div key={`${item.task.id}-${idx}`} className={styles.myTaskCard}>
                          <div className={styles.myTaskDate} style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '70px' }}>
                            <span style={{ fontWeight: 500 }}>
                              {item.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{item.timeSlot}</span>
                          </div>
                          <div className={styles.myTaskInfo}>
                            <strong>{item.task.title}</strong>
                            <span className={styles.taskMeta}>{item.task.duration} min · Pénibilité {item.task.penibility}%</span>
                          </div>
                          <span className={styles.taskPoints}>+{item.points} pts</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Tâches passées en attente de validation - toujours visibles */}
                {(getMyPastTasks().filter(t => !t.validated).length > 0 || getDelegatedToMeTasks().length > 0) && (
                  <div className={styles.monEspaceSection}>
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-warning)' }}>
                      <Icon name="clock" size={16} />Tâches à valider ({getMyPastTasks().filter(t => !t.validated).length + getDelegatedToMeTasks().length})
                    </h4>
                    <div className={styles.pastTasksList}>
                      {/* Tâches déléguées par d'autres */}
                      {getDelegatedToMeTasks().map((item, idx) => (
                        <div key={`delegated-${item.task.id}-${idx}`} className={`${styles.myTaskCard} ${styles.pendingTask}`} style={{ borderLeftColor: 'var(--color-primary)', borderLeftWidth: '3px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '70px' }}>
                            <span style={{ fontWeight: 500 }}>
                              {item.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }}>
                              Délégué par {item.delegatorName}
                            </span>
                          </div>
                          <div className={styles.myTaskInfo}>
                            <strong>{item.task.title}</strong>
                            <span className={styles.taskMeta}>{item.task.duration} min</span>
                          </div>
                          <div className={styles.validationBtns}>
                            <button 
                              className={styles.validateBtn}
                              onClick={() => validateTask(item.task.id, item.date, true)}
                            >
                              <Icon name="check" size={12} style={{ marginRight: '4px' }} />Je l'ai fait
                            </button>
                          </div>
                        </div>
                      ))}
                      
                      {/* Mes propres tâches à valider */}
                      {getMyPastTasks().filter(t => !t.validated).map((item, idx) => (
                        <div key={`pending-${item.task.id}-${idx}`} className={`${styles.myTaskCard} ${styles.pendingTask}`} style={{ position: 'relative' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '70px' }}>
                            <span style={{ fontWeight: 500 }}>
                              {item.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{item.timeSlot}</span>
                          </div>
                          <div className={styles.myTaskInfo}>
                            <strong>{item.task.title}</strong>
                            <span className={styles.taskMeta}>{item.task.duration} min</span>
                          </div>
                          <div className={styles.validationBtns}>
                            <button 
                              className={styles.validateBtn}
                              onClick={() => validateTask(item.task.id, item.date, true)}
                            >
                              <Icon name="check" size={12} style={{ marginRight: '4px' }} />Fait
                            </button>
                            <button 
                              className={styles.notDoneBtn}
                              onClick={() => setDelegationMenu({ taskId: item.task.id, date: item.date, timeSlot: item.timeSlot })}
                            >
                              <Icon name="xmark" size={12} style={{ marginRight: '4px' }} />Pas fait
                            </button>
                          </div>
                          
                          {/* Menu de délégation */}
                          {delegationMenu && delegationMenu.taskId === item.task.id && delegationMenu.date.getTime() === item.date.getTime() && (
                            <div style={{
                              position: 'absolute',
                              top: '100%',
                              right: 0,
                              zIndex: 100,
                              marginTop: '4px',
                              padding: '8px',
                              backgroundColor: 'var(--color-surface)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '8px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              minWidth: '200px'
                            }}>
                              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '8px' }}>Qui l'a fait ?</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {users.filter(u => u.familyId === selectedFamily && u.id !== currentUser).map(member => (
                                  <button
                                    key={member.id}
                                    onClick={() => delegateTask(item.task.id, item.date, member.id)}
                                    style={{
                                      padding: '8px 12px',
                                      textAlign: 'left',
                                      border: '1px solid var(--color-border)',
                                      borderRadius: '4px',
                                      backgroundColor: 'var(--color-bg-subtle)',
                                      color: 'var(--color-text)',
                                      cursor: 'pointer',
                                      fontSize: '0.875rem'
                                    }}
                                  >
                                    {member.name}
                                  </button>
                                ))}
                                <button
                                  onClick={() => delegateTask(item.task.id, item.date, null)}
                                  style={{
                                    padding: '8px 12px',
                                    textAlign: 'left',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '4px',
                                    backgroundColor: 'var(--color-bg-subtle)',
                                    color: 'var(--color-text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem'
                                  }}
                                >
                                  Personne
                                </button>
                                <button
                                  onClick={() => setDelegationMenu(null)}
                                  style={{
                                    padding: '6px 12px',
                                    textAlign: 'center',
                                    border: 'none',
                                    borderRadius: '4px',
                                    backgroundColor: 'transparent',
                                    color: 'var(--color-text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    marginTop: '4px'
                                  }}
                                >
                                  Annuler
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tâches passées déjà validées - menu déroulant */}
                {(getMyPastTasks().filter(t => t.validated).length > 0 || getMyDelegatedTasks().length > 0) && (
                  <div className={styles.monEspaceSection}>
                    <button 
                      className={styles.togglePastBtn}
                      onClick={() => setShowPastTasks(!showPastTasks)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Icon name={showPastTasks ? "chevronDown" : "chevronRight"} size={12} />Historique ({getMyPastTasks().filter(t => t.validated).length + getMyDelegatedTasks().length})
                    </button>
                    
                    {showPastTasks && (
                      <div className={styles.pastTasksList}>
                        {/* Tâches validées par moi */}
                        {getMyPastTasks().filter(t => t.validated).map((item, idx) => (
                          <div key={`validated-${item.task.id}-${idx}`} className={`${styles.myTaskCard} ${styles.validatedTask}`}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '70px' }}>
                              <span style={{ fontWeight: 500 }}>
                                {item.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{item.timeSlot}</span>
                            </div>
                            <div className={styles.myTaskInfo}>
                              <strong>{item.task.title}</strong>
                              <span className={styles.taskMeta}>{item.task.duration} min</span>
                            </div>
                            <div className={styles.validationBtns}>
                              <span className={styles.validatedBadge}><Icon name="check" size={12} style={{ marginRight: '4px' }} />+{item.points} pts</span>
                              <button 
                                className={styles.cancelValidationBtn}
                                onClick={() => validateTask(item.task.id, item.date, false)}
                                title="Annuler la validation"
                                style={{ 
                                  border: '1px solid #000', 
                                  backgroundColor: '#fff', 
                                  color: '#000',
                                  padding: '4px',
                                  borderRadius: '4px',
                                  cursor: 'pointer'
                                }}
                              >
                                <Icon name="xmark" size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                        
                        {/* Tâches déléguées (faites par quelqu'un d'autre ou personne) */}
                        {getMyDelegatedTasks().map((item, idx) => (
                          <div key={`delegated-${item.task.id}-${idx}`} className={styles.myTaskCard} style={{ opacity: 0.7 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '70px' }}>
                              <span style={{ fontWeight: 500 }}>
                                {item.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            <div className={styles.myTaskInfo}>
                              <strong>{item.task.title}</strong>
                              <span className={styles.taskMeta}>{item.task.duration} min</span>
                            </div>
                            <div className={styles.validationBtns}>
                              <span style={{ 
                                padding: '0.25rem 0.5rem', 
                                fontSize: '0.75rem', 
                                color: item.delegatedToName ? 'var(--color-primary)' : 'var(--color-text-muted)',
                                backgroundColor: item.delegatedToName ? 'var(--color-primary-subtle)' : 'var(--color-bg-subtle)',
                                borderRadius: '4px'
                              }}>
                                {item.delegatedToName ? `Fait par ${item.delegatedToName}` : 'Non fait'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tâche exceptionnelle */}
                <div className={styles.monEspaceSection}>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="star" size={16} />Ajouter une tâche exceptionnelle</h4>
                  <p className={styles.mutedSmall}>Vous avez fait quelque chose en plus ? Ajoutez-le ici pour gagner des points !</p>
                  
                  <div className={styles.exceptionalForm}>
                    <input
                      value={newExceptionalTask.title}
                      onChange={(e) => setNewExceptionalTask(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Ex: Nettoyage du garage"
                      className={styles.exceptionalInput}
                    />
                    <div className={styles.exceptionalNumbers}>
                      <div className={styles.numberField}>
                        <label>Durée (min)</label>
                        <input
                          type="number"
                          value={newExceptionalTask.duration}
                          onChange={(e) => setNewExceptionalTask(prev => ({ ...prev, duration: Number(e.target.value) }))}
                          min={5}
                        />
                      </div>
                      <div className={styles.numberField}>
                        <label>Pénibilité (%)</label>
                        <input
                          type="number"
                          value={newExceptionalTask.penibility}
                          onChange={(e) => setNewExceptionalTask(prev => ({ ...prev, penibility: Number(e.target.value) }))}
                          min={0}
                          max={100}
                        />
                      </div>
                      <div className={styles.numberField}>
                        <label>Points</label>
                        <span className={styles.previewPoints}>
                          +{Math.round((newExceptionalTask.duration * newExceptionalTask.penibility) / 10)} pts
                        </span>
                      </div>
                    </div>
                    <button 
                      className={styles.addExceptionalBtn}
                      onClick={addExceptionalTask}
                      disabled={!newExceptionalTask.title.trim()}
                    >
                      ➕ Ajouter et gagner les points
                    </button>
                  </div>

                  {/* Liste des tâches exceptionnelles */}
                  {getMyExceptionalTasks().length > 0 && (
                    <div className={styles.exceptionalList}>
                      <h5><Icon name="star" size={14} />Mes tâches exceptionnelles ({getMyExceptionalTasks().length})</h5>
                      {getMyExceptionalTasks().map(task => (
                        <div key={task.id} className={styles.myTaskCard}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '70px' }}>
                            <span style={{ fontWeight: 500 }}>
                              {new Date(task.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                              {new Date(task.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className={styles.myTaskInfo}>
                            <strong>{task.title}</strong>
                            <span className={styles.taskMeta}>{task.duration} min · Pénibilité {task.penibility}%</span>
                          </div>
                          <span className={styles.taskPoints}>+{calculateExceptionalPoints(task)} pts</span>
                          <button
                            onClick={() => deleteExceptionalTask(task.id)}
                            title="Supprimer cette tâche"
                            style={{
                              border: '1px solid #000',
                              backgroundColor: '#fff',
                              color: '#000',
                              padding: '4px',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            <Icon name="trash" size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {activeTab === "taches" && (
        <section className={styles.tabPanel}>
          <div className={styles.cardPanel}>
            <h3>Gestion des tâches</h3>
            
            {!selectedFamily && (
              <div className={styles.warningBox}>
                <Icon name="warning" size={16} />
                <span>Créez ou rejoignez une famille dans les Paramètres pour ajouter des tâches</span>
              </div>
            )}

            {/* Formulaire d'ajout */}
            <div className={styles.taskFormCard}>
              <h4><Icon name="circlePlus" size={18} />Nouvelle tâche</h4>
              
              <div className={styles.taskFormGrid}>
                <div className={styles.taskFormField}>
                  <label>Nom de la tâche</label>
                  <input
                    value={newTask.title}
                    onChange={(e) => setNewTask((t) => ({ ...t, title: e.target.value }))}
                    placeholder="Ex: Aspirateur salon"
                  />
                </div>

                <div className={styles.taskFormField}>
                  <label>Durée (min)</label>
                  <input
                    type="number"
                    value={newTask.duration}
                    onChange={(e) => setNewTask((t) => ({ ...t, duration: Number(e.target.value) }))}
                    min={5}
                  />
                </div>

                <div className={styles.taskFormField}>
                  <label>Pénibilité (%)</label>
                  <input
                    type="number"
                    value={newTask.penibility}
                    onChange={(e) => setNewTask((t) => ({ ...t, penibility: Number(e.target.value) }))}
                    min={0}
                    max={100}
                  />
                </div>

                <div className={`${styles.taskFormField} ${styles.fullWidth}`}>
                  <label>Créneaux</label>
                  <div className={styles.scheduleBuilder}>
                    <select value={newTaskDay} onChange={(e) => setNewTaskDay(e.target.value)}>
                      {dayOptions.map((day) => (
                        <option key={day}>{day}</option>
                      ))}
                    </select>
                    <input type="time" value={newTaskTime} onChange={(e) => setNewTaskTime(e.target.value)} />
                    <button type="button" className={styles.smallButton} onClick={addNewTaskSchedule}>
                      <Icon name="circlePlus" size={12} />
                      Ajouter
                    </button>
                  </div>
                  <div className={styles.scheduleChips}>
                    {newTaskSchedules.length === 0 ? (
                      <span className={styles.mutedSmall}>Aucun créneau ajouté</span>
                    ) : (
                      newTaskSchedules.map((entry) => (
                        <button
                          key={entry}
                          type="button"
                          className={styles.scheduleChip}
                          onClick={() => removeNewTaskSchedule(entry)}
                          title={`Supprimer ${entry}`}
                        >
                          <Icon name="trash" size={11} />
                          {entry}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.taskFormActions}>
                <button 
                  className={styles.addTaskBtn} 
                  onClick={addTask}
                  disabled={!newTask.title.trim() || !selectedFamily}
                >
                  <Icon name="circlePlus" size={16} />
                  Ajouter la tâche
                </button>
              </div>
            </div>

            {/* Liste des tâches */}
            <div className={styles.taskListHeader}>
              <h4>
                <Icon name="listCheck" size={18} />
                Liste des tâches
                <span className={styles.taskCount}>{familyTasks.length}</span>
              </h4>
            </div>

            {/* Evaluation Progress Banner - Desktop */}
            {currentUser && familyTasks.length > 0 && (
              <div className={`${styles.evalBanner} ${getUserEvaluationCount(currentUser) >= familyTasks.length ? styles.evalBannerSuccess : ''}`}>
                <Icon name={getUserEvaluationCount(currentUser) >= familyTasks.length ? "check" : "sliders"} size={16} />
                <span>
                  {getUserEvaluationCount(currentUser) >= familyTasks.length 
                    ? "Vous avez évalué toutes les tâches ✓ — Les points sont calculés sur la médiane des évaluations."
                    : `Évaluations personnelles: ${getUserEvaluationCount(currentUser)}/${familyTasks.length} tâches — Évaluez les tâches pour améliorer l'auto-attribution.`
                  }
                </span>
              </div>
            )}

            <div className={styles.listBox}>
              {familyTasks.map((task) => {
                const userId = computedAssignments.get(task.id);
                const user = familyUsers.find((u) => u.id === userId);
                const isEditing = editingTaskId === task.id;
                const pointsValue = Math.round((task.duration * task.penibility) / 10);
                const schedules = task.schedules && task.schedules.length > 0 ? task.schedules : [task.slot];
                
                return (
                  <div key={task.id} className={styles.taskRowCard}>
                    <div className={styles.taskInfo}>
                      {isEditing ? (
                        <div className={styles.formGridSmall}>
                          <label className={styles.label}>Nom</label>
                          <input
                            value={editTaskDraft.title}
                            onChange={(e) => setEditTaskDraft((t) => ({ ...t, title: e.target.value }))}
                            placeholder="Nom de la tâche"
                          />
                          <label className={styles.label}>Durée (min)</label>
                          <input
                            type="number"
                            value={editTaskDraft.duration}
                            onChange={(e) => setEditTaskDraft((t) => ({ ...t, duration: Number(e.target.value) }))}
                            min={5}
                          />
                          <label className={styles.label}>Pénibilité (%)</label>
                          <input
                            type="number"
                            value={editTaskDraft.penibility}
                            onChange={(e) => setEditTaskDraft((t) => ({ ...t, penibility: Number(e.target.value) }))}
                            min={0}
                            max={100}
                          />
                          <label className={styles.label}>Ajouter un créneau</label>
                          <div className={styles.scheduleBuilder}>
                            <select
                              value={getScheduleDraft(task.id).day}
                              onChange={(e) => updateScheduleDraft(task.id, { day: e.target.value })}
                            >
                              {dayOptions.map((day) => (
                                <option key={day}>{day}</option>
                              ))}
                            </select>
                            <input
                              type="time"
                              value={getScheduleDraft(task.id).time}
                              onChange={(e) => updateScheduleDraft(task.id, { time: e.target.value })}
                            />
                            <button className={styles.smallButton} onClick={() => addScheduleToTask(task.id)}>
                              <Icon name="circlePlus" size={12} />
                            </button>
                          </div>
                          <label className={styles.label}>Créneaux</label>
                          <div className={styles.scheduleChips}>
                            {schedules.map((entry) => (
                              <button
                                key={entry}
                                type="button"
                                className={styles.scheduleChip}
                                onClick={() => removeScheduleFromTask(task.id, entry)}
                                disabled={schedules.length <= 1}
                                title={`Supprimer ${entry}`}
                              >
                                <Icon name="trash" size={11} />
                                {entry}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          <h5 className={styles.taskTitle}>{task.title}</h5>
                          <div className={styles.taskMeta}>
                            <span className={styles.taskMetaItem}>
                              <Icon name="clock" size={14} />
                              {task.duration} min
                            </span>
                            <span className={styles.taskMetaItem}>
                              <Icon name="fire" size={14} />
                              {task.penibility}%
                            </span>
                          </div>
                          <div className={styles.taskSchedules}>
                            {schedules.map((s) => (
                              <span key={s} className={styles.taskScheduleTag}>{s}</span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    
                    <div className={styles.assigneeBlock}>
                      {!isEditing && (
                        <span className={styles.taskPoints}>+{pointsValue} pts</span>
                      )}
                      <div className={styles.rowActions}>
                        {isEditing ? (
                          <>
                            <button className={styles.smallButton} onClick={saveEditTask}>
                              <Icon name="check" size={12} />
                              Enregistrer
                            </button>
                            <button className={styles.smallGhost} onClick={cancelEditTask}>
                              Annuler
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className={`${styles.evalBtn} ${getMyEvaluation(task.id) ? styles.evalBtnDone : ''}`}
                              onClick={() => {
                                const myEval = getMyEvaluation(task.id);
                                setPendingEvaluation({
                                  duration: myEval?.duration ?? task.duration,
                                  penibility: myEval?.penibility ?? task.penibility
                                });
                                setShowEvaluationModal(task.id);
                              }}
                              aria-label={getMyEvaluation(task.id) ? "Modifier mon évaluation" : "Évaluer cette tâche"}
                              title={getMyEvaluation(task.id) ? "Modifier mon évaluation" : "Évaluer cette tâche"}
                            >
                              <Icon name={getMyEvaluation(task.id) ? "check" : "sliders"} size={14} />
                            </button>
                            <button
                              className={styles.editBtn}
                              onClick={() => startEditTask(task)}
                              aria-label="Modifier"
                              title="Modifier"
                            >
                              <Icon name="pen" size={14} />
                            </button>
                            <button
                              className={styles.deleteBtn}
                              onClick={() => deleteTask(task.id)}
                              aria-label="Supprimer"
                              title="Supprimer"
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {familyTasks.length === 0 && (
                <div className={styles.emptyTasks}>
                  <p>Aucune tâche pour le moment. Ajoutez-en une ci-dessus !</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === "dispos" && (
        <section className={styles.tabPanel}>
          <div className={styles.cardPanel}>
            <div className={styles.calendarHeader}>
              <h3>Calendrier familial</h3>
              <div className={styles.calendarControls}>
                <button onClick={() => setShowMemberSettings(!showMemberSettings)}>
                  {showMemberSettings ? "Voir calendrier" : <><Icon name="gear" size={14} style={{ marginRight: '6px' }} />Paramètres membres</>}
                </button>
              </div>
            </div>

            {showMemberSettings ? (
              <div className={styles.memberSettings}>
                <h4>Paramètres du calendrier</h4>
                <div className={styles.memberSettingsList}>
                  {calendarMembers.map((member) => (
                    <div key={member.id} className={styles.memberRow}>
                      <div className={styles.memberInfo}>
                        <label className={styles.memberColorDot} style={{ backgroundColor: member.color, position: 'relative', cursor: 'pointer' }}>
                          {member.color && (
                            <span className={styles.memberColorCheck}>
                              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="9" cy="9" r="8" stroke="#fff" strokeWidth="2" fill="none" />
                                <path d="M5 9.5L8 12.5L13 7.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </span>
                          )}
                          <input
                            type="color"
                            value={member.color}
                            onChange={(e) => {
                              updateMemberLocalState(member.id, "color", e.target.value);
                              updateMemberCalendarSettings(member.membershipId, e.target.value, member.calendarUrl);
                            }}
                            title="Couleur du membre"
                            className={styles.hiddenColorInput}
                          />
                        </label>
                        <span className={styles.memberName}>{member.name}</span>
                      </div>
                      <div className={styles.memberInputs}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>Lien iCal du membre</span>
                          <input
                            type="text"
                            placeholder="URL iCal (webcal://...)"
                            value={member.calendarUrl || ""}
                            onChange={(e) => updateMemberLocalState(member.id, "calendarUrl", e.target.value)}
                            className={styles.calendarUrlInput}
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </div>
                        <button
                          type="button"
                          className={styles.pasteBtn}
                          onClick={async () => {
                            try {
                              const text = await navigator.clipboard.readText();
                              updateMemberLocalState(member.id, "calendarUrl", text);
                            } catch (err) {
                              console.error("Failed to paste:", err);
                              // Fallback: prompt user to paste manually
                              const manualText = prompt("Collez l'URL iCal ici:");
                              if (manualText) {
                                updateMemberLocalState(member.id, "calendarUrl", manualText);
                              }
                            }
                          }}
                          title="Coller depuis le presse-papiers"
                        >
                          <Icon name="paste" size={12} style={{ marginRight: '4px' }} />Coller
                        </button>
                        <button
                          type="button"
                          className={styles.saveBtn}
                          onClick={() => {
                            updateMemberCalendarSettings(member.membershipId, member.color, member.calendarUrl);
                            alert("URL sauvegardée !");
                          }}
                        >
                          <Icon name="circleCheck" size={12} style={{ marginRight: '4px' }} />Sauvegarder
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={styles.helpBox}>
                  <strong>Comment obtenir l'URL iCal d'Apple Calendar ?</strong>
                  <ol>
                    <li>Ouvrez Apple Calendar sur Mac ou iCloud.com</li>
                    <li>Clic droit sur le calendrier → Partager le calendrier</li>
                    <li>Cochez "Calendrier public" et copiez l'URL</li>
                    <li>Collez l'URL ici (commence par webcal:// ou https://)</li>
                  </ol>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.calendarNav}>
                  <button onClick={() => navigateMonth(-1)}><Icon name="arrowLeft" size={12} /></button>
                  <span className={styles.monthYear}>{formatMonthYear(currentDate)}</span>
                  <button onClick={() => navigateMonth(1)}><Icon name="arrowRight" size={12} /></button>
                  <button 
                    className={styles.todayBtn}
                    onClick={() => setCurrentDate(new Date())}
                  >
                    Aujourd'hui
                  </button>
                </div>

                <div className={styles.calendarContainer}>
                  <div className={styles.calendarWeekHeader}>
                    {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
                      <div key={day} className={styles.weekDay}>{day}</div>
                    ))}
                  </div>
                  <div className={styles.calendarGrid}>
                    {getDaysInMonth(currentDate).map((day, idx) => {
                      const dYear = day.date.getFullYear();
                      const dMonth = String(day.date.getMonth() + 1).padStart(2, '0');
                      const dDay = String(day.date.getDate()).padStart(2, '0');
                      const dateStr = `${dYear}-${dMonth}-${dDay}`;
                      const dayEvents = getEventsForDate(day.date);
                      const todayDate = new Date();
                      const tYear = todayDate.getFullYear();
                      const tMonth = String(todayDate.getMonth() + 1).padStart(2, '0');
                      const tDay = String(todayDate.getDate()).padStart(2, '0');
                      const isToday = dateStr === `${tYear}-${tMonth}-${tDay}`;
                      
                      return (
                        <div 
                          key={idx} 
                          className={`${styles.calendarDay} ${!day.isCurrentMonth ? styles.otherMonth : ""} ${isToday ? styles.today : ""}`}
                        >
                          <div className={styles.dayNumber}>{day.date.getDate()}</div>
                          <div className={styles.dayEvents}>
                            {dayEvents.slice(0, 3).map((event, eventIdx) => (
                              <div 
                                key={eventIdx}
                                className={styles.calendarEvent}
                                style={{ backgroundColor: event.color + "33", borderLeft: `3px solid ${event.color}` }}
                                onClick={() => setSelectedEvent(event)}
                                title={`${event.title} - ${event.userName}`}
                              >
                                <span className={styles.eventTime}>
                                  {event.allDay ? "Journée" : new Date(event.start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <span className={styles.eventTitle}>{event.title}</span>
                              </div>
                            ))}
                            {dayEvents.length > 3 && (
                              <div className={styles.moreEvents}>+{dayEvents.length - 3} autres</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Legend */}
                <div className={styles.calendarLegend}>
                  <h4>Membres</h4>
                  <div className={styles.legendItems}>
                    {calendarMembers.map((member) => (
                      <div key={member.id} className={styles.legendItem}>
                        <div 
                          className={styles.legendColor} 
                          style={{ backgroundColor: member.color }}
                        />
                        <span>{member.name}</span>
                        {!member.calendarUrl && <span className={styles.noCalendar}>(pas de calendrier)</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Event modal */}
                {selectedEvent && (
                  <div className={styles.eventModal} onClick={() => setSelectedEvent(null)}>
                    <div className={styles.eventModalContent} onClick={(e) => e.stopPropagation()}>
                      <button className={styles.closeModal} onClick={() => setSelectedEvent(null)}>×</button>
                      <div 
                        className={styles.eventModalHeader}
                        style={{ backgroundColor: selectedEvent.color }}
                      >
                        <h4>{selectedEvent.title}</h4>
                        <span className={styles.eventModalUser}>{selectedEvent.userName}</span>
                      </div>
                      <div className={styles.eventModalBody}>
                        <p>
                          <strong>Date :</strong> {new Date(selectedEvent.start).toLocaleDateString("fr-FR", { 
                            weekday: "long", 
                            year: "numeric", 
                            month: "long", 
                            day: "numeric" 
                          })}
                        </p>
                        {!selectedEvent.allDay && (
                          <p>
                            <strong>Heure :</strong> {new Date(selectedEvent.start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            {selectedEvent.end && ` - ${new Date(selectedEvent.end).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
                          </p>
                        )}
                        {selectedEvent.location && (
                          <p><strong>Lieu :</strong> {selectedEvent.location}</p>
                        )}
                        {selectedEvent.description && (
                          <p><strong>Description :</strong> {selectedEvent.description}</p>
                        )}
                        <p className={styles.unavailableNote} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Icon name="warning" size={14} />{selectedEvent.userName} n'est pas disponible pendant cet événement
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {activeTab === "planificateur" && (
        <section className={styles.tabPanel}>
          <div className={styles.cardPanel}>
            <div className={styles.plannerHeader}>
              <h3>Mon Planning</h3>
              <div className={styles.plannerNav}>
                <button onClick={() => navigatePlannerDays(-1)} className={styles.navBtn}>
                  <Icon name="arrowLeft" size={12} />
                  <span>Précédent</span>
                </button>
                <button 
                  onClick={() => setPlannerStartDate(new Date())} 
                  className={styles.todayBtn}
                >
                  Aujourd'hui
                </button>
                <button onClick={() => navigatePlannerDays(1)} className={styles.navBtn}>
                  <span>Suivant</span>
                  <Icon name="arrowRight" size={12} />
                </button>
              </div>
              <button
                onClick={() => autoAssign()}
                className={`${styles.autoAssignBtn} ${isAllWeekAssigned ? styles.autoAssignBtnDone : ''}`}
                title={isAllWeekAssigned ? "Toutes les tâches sont déjà attribuées" : "Attribuer automatiquement les tâches non assignées"}
              >
                <Icon name="sparkles" size={14} />
                Auto-attribution
              </button>
            </div>

            <div className={styles.plannerGrid}>
              {getPlannerDays().map((day, dayIdx) => {
                const tasksForDay = getTasksForDay(day);
                const timeSlots = getUniqueTimeSlotsForDay(day);
                const isToday = day.toDateString() === new Date().toDateString();
                const myUnavailabilities = currentUser ? getUserDayUnavailabilities(currentUser, day) : [];
                
                return (
                  <div key={dayIdx} className={`${styles.plannerDay} ${isToday ? styles.plannerToday : ''}`}>
                    <div className={styles.plannerDayHeader}>
                      <h4>{formatPlannerDate(day)}</h4>
                      {isToday && <span className={styles.todayBadge}>Aujourd'hui</span>}
                    </div>

                    {/* Afficher les indisponibilités du jour */}
                    {myUnavailabilities.length > 0 && (
                      <div className={styles.dayUnavailabilities}>
                        <div className={styles.unavailabilityHeader}>
                          <Icon name="warning" size={14} />
                          Mes indisponibilités
                        </div>
                        {myUnavailabilities.map((unavail, idx) => (
                          <div key={idx} className={styles.unavailabilityItem}>
                            <span className={styles.unavailTime}>{unavail.time}</span>
                            <span className={styles.unavailSummary}>{unavail.summary}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Afficher les tâches groupées par heure */}
                    {timeSlots.map(timeSlot => (
                      <div key={timeSlot} className={styles.timeSlotSection}>
                        <div className={styles.timeSlotHeader}>
                          <span>{formatTimeDisplay(timeSlot)}</span>
                        </div>
                        {tasksForDay
                          .filter(task => getTaskTimeSlot(task, day) === timeSlot)
                          .map(task => {
                            const assignment = getTaskAssignment(task.id, day);
                            const assignedUserIds = assignment?.userIds || [];
                            const isAssignedToMe = assignedUserIds.includes(currentUser || '');
                            const isAssignedToOther = assignedUserIds.length > 0 && !isAssignedToMe;
                            const isPartiallyAssigned = assignedUserIds.length > 0 && !isAssignedToMe; // Others took it but I can still join
                            const iAmBusy = currentUser ? isUserBusyAtTime(currentUser, day, timeSlot) : false;
                            const pointsBreakdown = getPointsBreakdown(task);
                            const assignedNames = assignedUserIds.map(id => users.find(u => u.id === id)?.name).filter(Boolean).join(', ');
                            const taskKey = getTaskAssignmentKey(task.id, day);

                            return (
                              <div 
                                key={task.id} 
                                className={`${styles.plannerTask} ${isAssignedToMe ? styles.myTask : ''} ${isAssignedToOther ? styles.takenTask : ''} ${iAmBusy && !isAssignedToOther && !isAssignedToMe ? styles.busyTask : ''}`}
                              >
                                <div className={styles.plannerTaskInfo}>
                                  <strong>{task.title}</strong>
                                  <span className={styles.taskDetails}>
                                    {task.duration} min · Pénibilité {task.penibility}%
                                  </span>
                                </div>
                                <div className={styles.plannerTaskMeta}>
                                  <span className={styles.pointsBadge} title={`${pointsBreakdown.duration} min × ${pointsBreakdown.penibility}% ÷ 10`}>
                                    +{pointsBreakdown.total} pts
                                  </span>
                                  {isPartiallyAssigned && !isAssignedToMe && (
                                    <span 
                                      className={styles.assignedBadge}
                                      style={{ backgroundColor: getUserColor(assignedUserIds[0]) }}
                                    >
                                      {assignedNames}
                                    </span>
                                  )}
                                  {isAssignedToMe && (
                                    <button 
                                      className={styles.unclaimBtn}
                                      onClick={() => unclaimTask(task.id, day)}
                                    >
                                      <Icon name="check" size={12} />
                                      Pris par moi{assignedUserIds.length > 1 ? ` (+${assignedUserIds.length - 1})` : ''} · Annuler
                                    </button>
                                  )}
                                  {assignedUserIds.length === 0 && !iAmBusy && (
                                    <button 
                                      className={styles.claimBtn}
                                      onClick={() => claimTask(task.id, day)}
                                    >
                                      Je prends !
                                    </button>
                                  )}
                                  {isPartiallyAssigned && !isAssignedToMe && !iAmBusy && (
                                    <button 
                                      className={styles.claimBtn}
                                      onClick={() => claimTask(task.id, day)}
                                    >
                                      Rejoindre
                                    </button>
                                  )}
                                  {assignedUserIds.length === 0 && iAmBusy && (
                                    <span className={styles.busyBadge}>
                                      <Icon name="warning" size={12} />
                                      Indisponible
                                    </span>
                                  )}
                                  {currentUserRecord?.isAdmin && (
                                    <div className={styles.adminAssignWrapper}>
                                      <button
                                        className={styles.adminAssignBtn}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setAdminAssignMenu(prev =>
                                            prev?.key === taskKey ? null : { taskId: task.id, date: day, key: taskKey }
                                          );
                                        }}
                                        title="Gérer l'inscription"
                                      >
                                        <Icon name="users" size={12} />
                                      </button>
                                      {adminAssignMenu?.key === taskKey && (
                                        <div className={styles.adminAssignDropdown}>
                                          <div className={styles.adminAssignHeader}>Inscrire un membre</div>
                                          {familyUsers.filter(u => u.familyId === selectedFamily).map(member => {
                                            const isMemberAssigned = assignedUserIds.includes(member.id);
                                            return (
                                              <button
                                                key={member.id}
                                                className={`${styles.adminAssignOption} ${isMemberAssigned ? styles.adminAssignOptionActive : ''}`}
                                                onClick={() => isMemberAssigned
                                                  ? unassignForUser(task.id, day, member.id)
                                                  : assignForUser(task.id, day, member.id)
                                                }
                                              >
                                                <span>{member.name}</span>
                                                {isMemberAssigned && <Icon name="check" size={12} />}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ))}

                    {tasksForDay.length === 0 && (
                      <p className={styles.noTasks}>Aucune tâche ce jour</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.plannerLegend}>
              <div className={styles.legendRow}>
                <span className={styles.legendSample} style={{ backgroundColor: 'rgba(100, 200, 100, 0.2)', borderLeft: '3px solid #64c864' }}></span>
                <span>Pris par moi</span>
              </div>
              <div className={styles.legendRow}>
                <span className={styles.legendSample} style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', borderLeft: '3px solid #ef4444' }}></span>
                <span>Pris par quelqu'un d'autre</span>
              </div>
              <div className={styles.legendRow}>
                <span className={styles.legendSample} style={{ backgroundColor: 'rgba(255, 200, 100, 0.15)', borderLeft: '3px solid #ffc864' }}></span>
                <span>Je suis indisponible</span>
              </div>
              <div className={styles.legendRow}>
                <span className={styles.legendSample} style={{ backgroundColor: 'transparent', borderLeft: '3px solid var(--border)' }}></span>
                <span>Disponible</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === "points" && (
        <section className={styles.tabPanel}>
          <div className={styles.pointsGrid}>
            {/* Quota et équité */}
            <div className={styles.quotaCard}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="target" size={18} />Équité hebdomadaire</span>
                <button 
                  onClick={() => setShowQuotaExplain(true)} 
                  style={{ 
                    background: 'var(--color-primary-subtle)', 
                    border: 'none', 
                    borderRadius: '50%', 
                    width: '24px', 
                    height: '24px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    cursor: 'pointer',
                    color: 'var(--color-primary)',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                  title="Comment sont calculés les points ?"
                >
                  ?
                </button>
              </h3>
              {!selectedFamily ? (
                <p className={styles.mutedSmall} style={{ color: "#ff6b6b", display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon name="warning" size={14} />Sélectionnez une famille pour voir les quotas
                </p>
              ) : familyUsers.length === 0 ? (
                <p className={styles.mutedSmall}>Aucun membre dans la famille</p>
              ) : getActiveMembers().length === 0 ? (
                <p className={styles.mutedSmall}>Aucun membre actif dans le classement</p>
              ) : (
                <>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon name="listCheck" size={16} />Objectifs cette semaine
                    {getActiveMembers().length < familyUsers.length && (
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                        ({getActiveMembers().length}/{familyUsers.length} actifs)
                      </span>
                    )}
                  </h4>
                  <div className={styles.equityList}>
                    {getActiveMembers().map(user => {
                      const isMe = user.id === currentUser;
                      const currentWeekStart = getWeekStart(new Date());
                      const lastWeekStart = new Date(currentWeekStart);
                      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
                      
                      const absenceDays = getUserAbsenceDaysForWeek(user.id, currentWeekStart);
                      const baseQuota = getWeeklyQuotaPerPerson();
                      const quotaWithAbsences = getQuotaWithAbsences(user.id, currentWeekStart);
                      const adjustedQuota = getAdjustedQuota(user.id);
                      const pointsThisWeek = getUserPointsForWeek(user.id, currentWeekStart);
                      const remaining = getRemainingQuota(user.id);
                      const lastWeekBalance = getLastWeekBalance(user.id);
                      const equityStatus = getEquityStatus(user.id);
                      const progressPercent = adjustedQuota > 0 ? Math.min(100, (pointsThisWeek / adjustedQuota) * 100) : 100;
                      
                      // Calculs détaillés pour la semaine dernière
                      const lastWeekPoints = getUserPointsForWeek(user.id, lastWeekStart);
                      const lastWeekQuota = getQuotaWithAbsences(user.id, lastWeekStart);
                      const lastWeekAbsences = getUserAbsenceDaysForWeek(user.id, lastWeekStart);
                      
                      return (
                        <div key={user.id} className={`${styles.equityRow} ${isMe ? styles.myEquityRow : ''}`}>
                          <div className={styles.equityUser}>
                            <span className={styles.equityName}>
                              {user.name} {isMe && <span className={styles.meBadge}>(moi)</span>}
                            </span>
                            <div className={styles.equityTags}>
                              {absenceDays > 0 && (
                                <span className={styles.absenceTag}>
                                  🏖️ {absenceDays}j absent ({quotaWithAbsences} pts au lieu de {baseQuota})
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className={styles.equityProgress}>
                            <div className={styles.equityBar}>
                              <div 
                                className={`${styles.equityFill} ${equityStatus.status === 'ahead' ? styles.fillAhead : equityStatus.status === 'behind' ? styles.fillBehind : ''}`}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                            <span className={styles.equityNumbers}>
                              {pointsThisWeek} / {adjustedQuota} pts
                            </span>
                          </div>
                          <div className={styles.equityStatus}>
                            {remaining > 0 ? (
                              <span className={styles.remaining}>Reste {remaining} pts</span>
                            ) : (
                              <span className={styles.completed} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Icon name="circleCheck" size={12} />Quota atteint</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Classement */}
            <div className={styles.scoreCard}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="trophy" size={18} />Classement total</h3>
              {!selectedFamily ? (
                <p className={styles.mutedSmall} style={{ color: "#ff6b6b", display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon name="warning" size={14} />Sélectionnez une famille pour voir le classement
                </p>
              ) : familyUsers.length === 0 ? (
                <p className={styles.mutedSmall}>Aucun membre dans la famille</p>
              ) : (
                getFamilyLeaderboard().map((user, idx) => {
                  const maxPoints = getMaxPoints();
                  const percentage = maxPoints > 0 ? (user.totalPoints / maxPoints) * 100 : 0;
                  const isMe = user.id === currentUser;
                  
                  return (
                    <div 
                      key={user.id} 
                      className={`${styles.scoreRow} ${isMe ? styles.myScoreRow : ''} ${styles.clickableRow}`}
                      onClick={() => setPointsHistoryModal({ userId: user.id, userName: user.name })}
                      title="Cliquez pour voir l'historique des gains"
                    >
                      <div className={styles.rankBadge}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                      </div>
                      <div className={styles.scoreUserInfo}>
                        <p>{user.name} {isMe && <span className={styles.meBadge}>(moi)</span>}</p>
                        <span className={styles.taskMeta}>
                          {user.validatedCount} tâche{user.validatedCount > 1 ? 's' : ''} validée{user.validatedCount > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className={styles.scoreBar}>
                        <div style={{ width: `${percentage}%` }} />
                      </div>
                      <div className={styles.scorePointsWithIcon}>
                        <strong className={styles.scorePoints}>{user.totalPoints} pts</strong>
                        <Icon name="chevronRight" size={14} style={{ color: 'var(--color-text-muted)' }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Stats */}
            <div className={styles.impactCard}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="chartBar" size={18} />Statistiques</h3>
              {selectedFamily && familyUsers.length > 0 && (
                <>
                  <div className={styles.statsGrid}>
                    <div className={styles.statItem}>
                      <span className={styles.statValue}>
                        {getFamilyLeaderboard().reduce((sum, u) => sum + u.totalPoints, 0)}
                      </span>
                      <span className={styles.statLabel}>Points totaux famille</span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statValue}>
                        {getFamilyLeaderboard().reduce((sum, u) => sum + u.validatedCount, 0)}
                      </span>
                      <span className={styles.statLabel}>Tâches validées</span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statValue}>
                        {Math.round(getFamilyLeaderboard().reduce((sum, u) => sum + u.totalPoints, 0) / Math.max(getActiveMembers().length, 1))}
                      </span>
                      <span className={styles.statLabel}>Moyenne par membre actif</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Modal Explication du calcul des quotas */}
      {showQuotaExplain && (
        <div className={styles.eventModal} onClick={() => setShowQuotaExplain(false)}>
          <div className={styles.historyModalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <button className={styles.closeModal} onClick={() => setShowQuotaExplain(false)}>×</button>
            <div className={styles.historyModalHeader}>
              <h4><Icon name="help" size={20} /> Comment sont calculés vos objectifs ?</h4>
            </div>
            <div className={styles.historyModalBody} style={{ padding: '16px' }}>
              {/* Calcul détaillé */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* Étape 1 : Points totaux disponibles */}
                <div style={{ background: 'var(--color-bg-subtle)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: 'var(--color-primary)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>1</span>
                    Points disponibles cette semaine
                  </div>
                  <div style={{ marginLeft: '28px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                    On additionne les points de toutes les tâches × leur fréquence hebdomadaire
                  </div>
                  <div style={{ marginLeft: '28px', marginTop: '8px', fontWeight: 600, color: 'var(--color-primary)' }}>
                    = {getWeeklyAvailablePoints()} points au total
                  </div>
                  <div style={{ marginLeft: '28px', marginTop: '4px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    ({familyTasks.length} tâche{familyTasks.length > 1 ? 's' : ''} configurée{familyTasks.length > 1 ? 's' : ''})
                  </div>
                </div>

                {/* Étape 2 : Division par nombre de membres actifs */}
                <div style={{ background: 'var(--color-bg-subtle)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: 'var(--color-primary)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>2</span>
                    Quota par personne
                  </div>
                  <div style={{ marginLeft: '28px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                    {getWeeklyAvailablePoints()} pts ÷ {getActiveMembers().length} membre{getActiveMembers().length > 1 ? 's' : ''} actif{getActiveMembers().length > 1 ? 's' : ''}
                    {getActiveMembers().length < familyUsers.length && (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginLeft: '4px' }}>
                        ({familyUsers.length - getActiveMembers().length} désactivé{familyUsers.length - getActiveMembers().length > 1 ? 's' : ''})
                      </span>
                    )}
                  </div>
                  <div style={{ marginLeft: '28px', marginTop: '8px', fontWeight: 600, color: 'var(--color-primary)' }}>
                    = {getWeeklyQuotaPerPerson()} points par personne
                  </div>
                </div>

                {/* Étape 3 : Ajustements */}
                <div style={{ background: 'var(--color-bg-subtle)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: 'var(--color-primary)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>3</span>
                    Ajustements personnels
                  </div>
                  <div style={{ marginLeft: '28px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                    <div>• <strong>Absences :</strong> Si vous avez un événement "toute la journée", votre quota diminue proportionnellement</div>
                    <div style={{ marginTop: '4px' }}>• <strong>Report :</strong> Si vous avez fait plus/moins que votre quota la semaine dernière, la différence est reportée</div>
                  </div>
                </div>

                {/* Récap pour l'utilisateur courant */}
                {currentUser && (
                  <div style={{ background: 'var(--color-primary-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-primary)' }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon name="user" size={16} />
                      Votre objectif cette semaine
                    </div>
                    <div style={{ marginLeft: '24px', fontSize: '14px' }}>
                      <div>Quota de base : {getWeeklyQuotaPerPerson()} pts</div>
                      {getUserAbsenceDaysForWeek(currentUser, getWeekStart(new Date())) > 0 && (
                        <div style={{ color: 'var(--color-warning)' }}>
                          − {Math.round(getWeeklyQuotaPerPerson() * getUserAbsenceDaysForWeek(currentUser, getWeekStart(new Date())) / 7)} pts (absence {getUserAbsenceDaysForWeek(currentUser, getWeekStart(new Date()))}j)
                        </div>
                      )}
                      {getLastWeekBalance(currentUser) !== 0 && (
                        <div style={{ color: getLastWeekBalance(currentUser) > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                          {getLastWeekBalance(currentUser) > 0 ? '−' : '+'} {Math.abs(getLastWeekBalance(currentUser))} pts (report sem. dernière)
                        </div>
                      )}
                      <div style={{ marginTop: '8px', fontWeight: 700, fontSize: '16px', color: 'var(--color-primary)' }}>
                        = {getAdjustedQuota(currentUser)} pts à faire cette semaine
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        Déjà fait : {getUserPointsForWeek(currentUser, getWeekStart(new Date()))} pts • 
                        Reste : {getRemainingQuota(currentUser)} pts
                      </div>
                    </div>
                  </div>
                )}

                {/* Détail semaine dernière */}
                {currentUser && (
                  <details style={{ marginTop: '8px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 500, color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                      📊 Détail semaine dernière {getLastWeekBalance(currentUser) !== 0 ? `(report de ${Math.abs(getLastWeekBalance(currentUser))} pts)` : '(pas de report)'}
                    </summary>
                    <div style={{ marginTop: '8px', padding: '12px', background: 'var(--color-bg-subtle)', borderRadius: '8px', fontSize: '13px' }}>
                      {(() => {
                        const lastWeekStart = getWeekStart(new Date());
                        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
                        const lastWeekEnd = new Date(lastWeekStart);
                        lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
                        const lastWeekKey = formatLocalDate(lastWeekStart);
                        
                        // Chercher dans l'historique sauvegardé
                        const historyEntry = weeklyHistory.find(
                          h => h.userId === currentUser && h.weekStart === lastWeekKey
                        );
                        
                        // Toujours calculer les points actuels (basé sur validatedTasks)
                        const calculatedPoints = getUserPointsForWeek(currentUser, lastWeekStart);
                        const calculatedQuota = getQuotaWithAbsences(currentUser, lastWeekStart);
                        
                        // Utiliser l'historique si disponible, sinon les valeurs calculées
                        const pointsLastWeek = historyEntry?.pointsEarned ?? calculatedPoints;
                        const quotaLastWeek = historyEntry?.quota ?? calculatedQuota;
                        const isFromHistory = !!historyEntry;
                        
                        return (
                          <>
                            <div style={{ marginBottom: '8px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span>Semaine du {lastWeekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au {lastWeekEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                              {isFromHistory && (
                                <span style={{ fontSize: '11px', background: 'var(--color-success)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>✓ Historique</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>Points gagnés : <strong>{pointsLastWeek}</strong> pts</span>
                              <button
                                onClick={() => {
                                  const newPoints = prompt(`Corriger les points gagnés la semaine dernière (actuellement ${pointsLastWeek}) :`, String(pointsLastWeek));
                                  if (newPoints && !isNaN(Number(newPoints))) {
                                    setWeeklyHistory(prev => {
                                      const filtered = prev.filter(h => !(h.userId === currentUser && h.weekStart === lastWeekKey));
                                      return [...filtered, {
                                        weekStart: lastWeekKey,
                                        userId: currentUser,
                                        pointsEarned: Number(newPoints),
                                        quota: quotaLastWeek,
                                        balance: Number(newPoints) - quotaLastWeek
                                      }];
                                    });
                                  }
                                }}
                                style={{
                                  background: 'transparent',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: '4px',
                                  padding: '2px 6px',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  color: 'var(--color-text-muted)'
                                }}
                              >
                                ✏️ Corriger
                              </button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>Quota attendu : <strong>{quotaLastWeek}</strong> pts</span>
                              <button
                                onClick={() => {
                                  const newQuota = prompt(`Corriger le quota de la semaine dernière (actuellement ${quotaLastWeek}) :`, String(quotaLastWeek));
                                  if (newQuota && !isNaN(Number(newQuota))) {
                                    setWeeklyHistory(prev => {
                                      const filtered = prev.filter(h => !(h.userId === currentUser && h.weekStart === lastWeekKey));
                                      return [...filtered, {
                                        weekStart: lastWeekKey,
                                        userId: currentUser,
                                        pointsEarned: pointsLastWeek,
                                        quota: Number(newQuota),
                                        balance: pointsLastWeek - Number(newQuota)
                                      }];
                                    });
                                  }
                                }}
                                style={{
                                  background: 'transparent',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: '4px',
                                  padding: '2px 6px',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  color: 'var(--color-text-muted)'
                                }}
                              >
                                ✏️ Corriger
                              </button>
                            </div>
                            <div style={{ marginTop: '4px', fontWeight: 600, color: pointsLastWeek >= quotaLastWeek ? 'var(--color-success)' : 'var(--color-error)' }}>
                              Balance : {pointsLastWeek} - {quotaLastWeek} = {pointsLastWeek - quotaLastWeek} pts
                            </div>
                            {!isFromHistory && (
                              <div style={{ marginTop: '8px', padding: '8px', background: 'var(--color-warning)', borderRadius: '4px', fontSize: '12px', color: 'white' }}>
                                ⚠️ Ces valeurs sont estimées. Cliquez sur "Corriger" pour entrer le quota réel de cette semaine-là.
                              </div>
                            )}
                            {isFromHistory && (
                              <button
                                onClick={() => {
                                  if (confirm('Supprimer cet historique ? Les valeurs seront recalculées à partir des données actuelles.')) {
                                    setWeeklyHistory(prev => prev.filter(h => !(h.userId === currentUser && h.weekStart === lastWeekKey)));
                                  }
                                }}
                                style={{
                                  marginTop: '8px',
                                  background: 'var(--color-error)',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  color: 'white'
                                }}
                              >
                                🗑️ Supprimer cet historique
                              </button>
                            )}
                            {isFromHistory && calculatedPoints !== pointsLastWeek && (
                              <div style={{ marginTop: '8px', padding: '8px', background: 'var(--color-primary-subtle)', borderRadius: '4px', fontSize: '12px' }}>
                                <div style={{ marginBottom: '4px' }}>
                                  💡 Points calculés actuellement : <strong>{calculatedPoints}</strong> pts (différent de l'historique)
                                </div>
                                <button
                                  onClick={() => {
                                    setWeeklyHistory(prev => {
                                      const filtered = prev.filter(h => !(h.userId === currentUser && h.weekStart === lastWeekKey));
                                      return [...filtered, {
                                        weekStart: lastWeekKey,
                                        userId: currentUser,
                                        pointsEarned: calculatedPoints,
                                        quota: quotaLastWeek,
                                        balance: calculatedPoints - quotaLastWeek
                                      }];
                                    });
                                  }}
                                  style={{
                                    background: 'var(--color-primary)',
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    color: 'white'
                                  }}
                                >
                                  🔄 Mettre à jour avec {calculatedPoints} pts
                                </button>
                              </div>
                            )}
                            
                            {/* Liste des tâches validées la semaine dernière */}
                            <details style={{ marginTop: '12px' }}>
                              <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                📋 Détail des tâches détectées ({validatedTasks.filter(v => {
                                  if (v.userId !== currentUser || !v.validated) return false;
                                  const [year, month, day] = v.date.split('-').map(Number);
                                  const taskDate = new Date(year, month - 1, day).getTime();
                                  return taskDate >= lastWeekStart.getTime() && taskDate < lastWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000;
                                }).length} validations)
                              </summary>
                              <div style={{ marginTop: '8px', fontSize: '11px', maxHeight: '150px', overflowY: 'auto' }}>
                                {validatedTasks
                                  .filter(v => {
                                    if (v.userId !== currentUser || !v.validated) return false;
                                    const [year, month, day] = v.date.split('-').map(Number);
                                    const taskDate = new Date(year, month - 1, day).getTime();
                                    return taskDate >= lastWeekStart.getTime() && taskDate < lastWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000;
                                  })
                                  .map((v, i) => {
                                    const task = familyTasks.find(t => t.id === v.taskId);
                                    const [year, month, day] = v.date.split('-').map(Number);
                                    const localDate = new Date(year, month - 1, day);
                                    return (
                                      <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--color-border)' }}>
                                        <strong>{task?.title || 'Tâche inconnue'}</strong> - {localDate.toLocaleDateString('fr-FR')}
                                        {task && <span style={{ color: 'var(--color-success)' }}> (+{calculateTaskPoints(task)} pts)</span>}
                                      </div>
                                    );
                                  })}
                                {exceptionalTasks
                                  .filter(t => {
                                    if (t.userId !== currentUser || !t.validated) return false;
                                    const [year, month, day] = t.date.split('-').map(Number);
                                    const taskDate = new Date(year, month - 1, day).getTime();
                                    return taskDate >= lastWeekStart.getTime() && taskDate < lastWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000;
                                  })
                                  .map((t, i) => {
                                    const [year, month, day] = t.date.split('-').map(Number);
                                    const localDate = new Date(year, month - 1, day);
                                    return (
                                      <div key={`exc-${i}`} style={{ padding: '4px 0', borderBottom: '1px solid var(--color-border)' }}>
                                        <strong>⭐ {t.title}</strong> - {localDate.toLocaleDateString('fr-FR')}
                                        <span style={{ color: 'var(--color-success)' }}> (+{calculateExceptionalPoints(t)} pts)</span>
                                      </div>
                                    );
                                  })}
                                {validatedTasks.filter(v => {
                                  if (v.userId !== currentUser || !v.validated) return false;
                                  const [year, month, day] = v.date.split('-').map(Number);
                                  const taskDate = new Date(year, month - 1, day).getTime();
                                  return taskDate >= lastWeekStart.getTime() && taskDate < lastWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000;
                                }).length === 0 && exceptionalTasks.filter(t => {
                                  if (t.userId !== currentUser || !t.validated) return false;
                                  const [year, month, day] = t.date.split('-').map(Number);
                                  const taskDate = new Date(year, month - 1, day).getTime();
                                  return taskDate >= lastWeekStart.getTime() && taskDate < lastWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000;
                                }).length === 0 && (
                                  <div style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                    Aucune tâche validée détectée pour cette période
                                  </div>
                                )}
                              </div>
                            </details>
                          </>
                        );
                      })()}
                    </div>
                  </details>
                )}

                {/* Détail des tâches */}
                <details style={{ marginTop: '8px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 500, color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                    Voir le détail des tâches ({familyTasks.length})
                  </summary>
                  <div style={{ marginTop: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                    {familyTasks.map(task => {
                      const schedules = task.schedules && task.schedules.length > 0 ? task.schedules : [task.slot];
                      const points = calculateTaskPoints(task);
                      return (
                        <div key={task.id} style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          padding: '8px', 
                          borderBottom: '1px solid var(--color-border)',
                          fontSize: '13px'
                        }}>
                          <span>{task.title}</span>
                          <span style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
                            {points} pts × {schedules.length}/sem = {points * schedules.length} pts
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historique des points */}
      {pointsHistoryModal && (
        <div className={styles.eventModal} onClick={() => setPointsHistoryModal(null)}>
          <div className={styles.historyModalContent} onClick={e => e.stopPropagation()}>
            <button className={styles.closeModal} onClick={() => setPointsHistoryModal(null)}>×</button>
            <div className={styles.historyModalHeader}>
              <h4><Icon name="trophy" size={20} /> Historique de {pointsHistoryModal.userName}</h4>
              <p className={styles.historyTotalPoints}>
                Total : <strong>{getUserTotalPoints(pointsHistoryModal.userId)} points</strong>
              </p>
            </div>
            <div className={styles.historyModalBody}>
              {getUserPointsHistory(pointsHistoryModal.userId).length === 0 ? (
                <p className={styles.emptyHistory}>Aucun point gagné pour le moment</p>
              ) : (
                <div className={styles.historyList}>
                  {getUserPointsHistory(pointsHistoryModal.userId).map(item => (
                    <div key={item.id} className={styles.historyItem}>
                      <div className={styles.historyItemLeft}>
                        <span className={`${styles.historyTypeBadge} ${item.type === 'exceptional' ? styles.exceptional : ''}`}>
                          {item.type === 'exceptional' ? '⭐' : '✓'}
                        </span>
                        <div className={styles.historyItemInfo}>
                          <span className={styles.historyItemTitle}>{item.title}</span>
                          <span className={styles.historyItemDate}>
                            {new Date(item.date).toLocaleDateString('fr-FR', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short'
                            })}
                          </span>
                        </div>
                      </div>
                      <span className={styles.historyItemPoints}>+{item.points} pts</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Mobile helper functions
  const currentWeekStart = getWeekStart(selectedMobileDay);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const goToPreviousWeek = () => {
    const newDate = new Date(selectedMobileDay);
    newDate.setDate(newDate.getDate() - 7);
    setSelectedMobileDay(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(selectedMobileDay);
    newDate.setDate(newDate.getDate() + 7);
    setSelectedMobileDay(newDate);
  };

  const getWeekRange = (start: Date) => {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
  };

  const getDayTasks = (day: Date) => {
    const tasksForDay = getTasksForDay(day);
    return tasksForDay.map(task => {
      const assignment = getTaskAssignment(task.id, day);
      const assignedUserIds = assignment?.userIds || [];
      const members = assignedUserIds.map(id => users.find(u => u.id === id)).filter(Boolean);
      return {
        task,
        member: members[0], // For backwards compatibility
        members,
        assignedUserIds,
        timeSlot: getTaskTimeSlot(task, day),
        points: calculateTaskPoints(task)
      };
    });
  };

  const generateCalendarDays = (month: Date) => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstDay = new Date(year, m, 1);
    const lastDay = new Date(year, m + 1, 0);
    const startPadding = (firstDay.getDay() + 6) % 7; // Monday = 0
    const days: (Date | null)[] = [];
    
    for (let i = 0; i < startPadding; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, m, d));
    
    return days;
  };

  // Mobile view - iPhone frame
  if (viewMode === 'mobile') {
    return (
      <div className={styles.mobileWrapper}>
        <div className={styles.phoneFrame}>
          <div className={styles.phoneDynamicIsland}></div>
          <div className={styles.phoneScreen}>
            <header className={styles.mobileTopbar}>
              <div className={styles.brandSection}>
                <img 
                  src="/logo/logo_sans_nom.svg" 
                  alt="Fam'Planner" 
                  className={styles.logo}
                  width={28}
                  height={28}
                />
                <h1 className={styles.mobileTitle}>{tabs.find(t => t.id === activeTab)?.shortLabel}</h1>
              </div>
              <div className={styles.mobileActions}>
                <button 
                  className={styles.mobileIconBtn}
                  onClick={() => {
                    const newTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'auto' : 'light';
                    setTheme(newTheme);
                  }}
                  title={`Thème: ${theme === 'light' ? 'Clair' : theme === 'dark' ? 'Sombre' : 'Auto'}`}
                >
                  <Icon name={theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'circleHalfStroke'} size={20} />
                </button>
                <Link href="/settings" className={styles.mobileIconBtn} title="Paramètres">
                  <Icon name="gear" size={20} />
                </Link>
              </div>
            </header>

            <div className={styles.phoneContent}>
              {/* Mobile Accueil */}
              {activeTab === "monespace" && (
                <div className={styles.mobileTab}>
                  {/* Points Card - Compact */}
                  <div className={styles.mobilePointsCard}>
                    <div className={styles.mobilePointsInfo}>
                      <span className={styles.mobilePointsLabel}>Mes points</span>
                      <span className={styles.mobilePointsValue}>{getMyTotalPoints()}</span>
                    </div>
                    <div className={styles.mobilePointsIcon}>
                      <Icon name="star" size={24} />
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className={styles.mobileQuickStats}>
                    <div className={styles.mobileStatCard}>
                      <span className={styles.mobileStatValue}>{getMyUpcomingTasks().length}</span>
                      <span className={styles.mobileStatLabel}>À faire</span>
                    </div>
                    <div className={styles.mobileStatCard}>
                      <span className={styles.mobileStatValue}>{getMyPastTasks().filter(t => !t.validated).length}</span>
                      <span className={styles.mobileStatLabel}>À valider</span>
                    </div>
                    <div className={styles.mobileStatCard}>
                      <span className={styles.mobileStatValue}>{currentUser ? getUserPointsHistory(currentUser).length : 0}</span>
                      <span className={styles.mobileStatLabel}>Cette sem.</span>
                    </div>
                  </div>

                  {/* Upcoming Tasks - Compact List */}
                  {getMyUpcomingTasks().length > 0 && (
                    <div className={styles.mobileSection}>
                      <h3 className={styles.mobileSectionTitle}>
                        <Icon name="clipboardList" size={16} />
                        Prochaines tâches
                      </h3>
                      <div className={styles.mobileTaskList}>
                        {getMyUpcomingTasks().slice(0, 4).map((item, idx) => (
                          <div key={`mobile-task-${idx}`} className={styles.mobileTaskItem}>
                            <div className={styles.mobileTaskLeft}>
                              <span className={styles.mobileTaskTitle}>{item.task.title}</span>
                              <span className={styles.mobileTaskMeta}>
                                {item.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })} · {item.timeSlot}
                              </span>
                            </div>
                            <span className={styles.mobileTaskPoints}>+{item.points}</span>
                          </div>
                        ))}
                        {getMyUpcomingTasks().length > 4 && (
                          <button className={styles.mobileShowMore}>
                            Voir tout ({getMyUpcomingTasks().length})
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tasks to Validate */}
                  {(getMyPastTasks().filter(t => !t.validated).length > 0 || getDelegatedToMeTasks().length > 0) && (
                    <div className={styles.mobileSection}>
                      <h3 className={styles.mobileSectionTitle} style={{ color: 'var(--color-warning)' }}>
                        <Icon name="clock" size={16} />
                        À valider
                      </h3>
                      <div className={styles.mobileTaskList}>
                        {getMyPastTasks().filter(t => !t.validated).slice(0, 3).map((item, idx) => (
                          <div key={`validate-${idx}`} className={styles.mobileValidateItem}>
                            <div className={styles.mobileTaskLeft}>
                              <span className={styles.mobileTaskTitle}>{item.task.title}</span>
                              <span className={styles.mobileTaskMeta}>
                                {item.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                            <div className={styles.mobileValidateBtns}>
                              <button 
                                className={styles.mobileValidateYes}
                                onClick={() => validateTask(item.task.id, item.date, true)}
                              >
                                <Icon name="check" size={16} />
                              </button>
                              <button 
                                className={styles.mobileValidateNo}
                                onClick={() => setMobileDelegationModal({ taskId: item.task.id, date: item.date })}
                              >
                                <Icon name="x" size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Validation History - Collapsible */}
                  {currentUser && getUserPointsHistory(currentUser).length > 0 && (
                    <div className={styles.mobileSection}>
                      <button 
                        className={styles.mobileHistoryToggle}
                        onClick={() => setMobileHistoryOpen(!mobileHistoryOpen)}
                      >
                        <div className={styles.mobileHistoryToggleLeft}>
                          <Icon name="check" size={16} />
                          <span>Historique validé ({getUserPointsHistory(currentUser).length})</span>
                        </div>
                        <Icon name={mobileHistoryOpen ? "chevronDown" : "chevronRight"} size={16} />
                      </button>
                      {mobileHistoryOpen && (
                        <div className={styles.mobileHistoryList}>
                          {getUserPointsHistory(currentUser).map((item, idx) => (
                            <div key={`history-${idx}`} className={styles.mobileHistoryItem}>
                              <div className={styles.mobileTaskLeft}>
                                <span className={styles.mobileTaskTitle}>{item.title}</span>
                                <span className={styles.mobileTaskMeta}>
                                  {new Date(item.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                </span>
                              </div>
                              <div className={styles.mobileHistoryRight}>
                                <span className={styles.mobileHistoryPoints}>+{item.points}</span>
                                <button 
                                  className={styles.mobileCancelValidationBtn}
                                  onClick={() => {
                                    const task = tasks.find(t => t.title === item.title);
                                    if (task) {
                                      validateTask(task.id, new Date(item.date), false);
                                    }
                                  }}
                                  title="Annuler la validation"
                                >
                                  <Icon name="x" size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Exceptional Task - Collapsible */}
                  <div className={styles.mobileSection}>
                    <button 
                      className={styles.mobileExceptionalToggle}
                      onClick={() => setMobileShowExceptionalForm(!mobileShowExceptionalForm)}
                    >
                      <div className={styles.mobileExceptionalToggleLeft}>
                        <Icon name="star" size={16} />
                        <span>Tâche exceptionnelle</span>
                      </div>
                      <Icon name={mobileShowExceptionalForm ? "chevronDown" : "plus"} size={16} />
                    </button>
                    {mobileShowExceptionalForm && (
                      <div className={styles.mobileExceptionalForm}>
                        <input
                          type="text"
                          className={styles.mobileInput}
                          placeholder="Nom de la tâche"
                          value={newExceptionalTask.title}
                          onChange={(e) => setNewExceptionalTask(prev => ({ ...prev, title: e.target.value }))}
                        />
                        <div className={styles.mobileInputRowEqual}>
                          <div className={styles.mobileInputGroupCompact}>
                            <label>Durée</label>
                            <div className={styles.mobileInputWithUnit}>
                              <input
                                type="number"
                                value={newExceptionalTask.duration || ''}
                                onChange={(e) => setNewExceptionalTask(prev => ({ ...prev, duration: e.target.value === '' ? 0 : parseInt(e.target.value) }))}
                                min={5}
                                max={240}
                              />
                              <span>min</span>
                            </div>
                          </div>
                          <div className={styles.mobileInputGroupCompact}>
                            <label>Pénibilité</label>
                            <div className={styles.mobileInputWithUnit}>
                              <input
                                type="number"
                                value={newExceptionalTask.penibility || ''}
                                onChange={(e) => setNewExceptionalTask(prev => ({ ...prev, penibility: e.target.value === '' ? 0 : parseInt(e.target.value) }))}
                                min={1}
                                max={100}
                              />
                              <span>%</span>
                            </div>
                          </div>
                        </div>
                        <div className={styles.mobileExceptionalFooter}>
                          <span className={styles.mobileExceptionalPoints}>
                            +{Math.round((newExceptionalTask.duration * newExceptionalTask.penibility) / 10)} pts
                          </span>
                          <button 
                            className={styles.mobileCreateBtnSmall}
                            onClick={() => {
                              addExceptionalTask();
                              setMobileShowExceptionalForm(false);
                            }}
                            disabled={!newExceptionalTask.title.trim()}
                          >
                            <Icon name="plus" size={14} />
                            Ajouter
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Mobile Planning */}
              {activeTab === "planificateur" && (
                <div className={styles.mobileTab}>
                  <div className={styles.mobileWeekNav}>
                    <button onClick={goToPreviousWeek} className={styles.mobileNavBtn}>
                      <Icon name="chevronLeft" size={20} />
                    </button>
                    <span className={styles.mobileWeekLabel}>
                      {getWeekRange(currentWeekStart)}
                    </span>
                    <button onClick={goToNextWeek} className={styles.mobileNavBtn}>
                      <Icon name="chevronRight" size={20} />
                    </button>
                  </div>

                  {/* Bouton Auto-attribution mobile */}
                  <button
                    onClick={() => autoAssign()}
                    className={`${styles.mobileAutoAssignBtn} ${isAllWeekAssigned ? styles.mobileAutoAssignBtnDone : ''}`}
                  >
                    <Icon name="sparkles" size={16} />
                    Auto-attribution
                  </button>

                  {/* Day Pills */}
                  <div className={styles.mobileDayPills}>
                    {weekDays.map((day, idx) => {
                      const isToday = day.toDateString() === new Date().toDateString();
                      const isSelected = selectedMobileDay && day.toDateString() === selectedMobileDay.toDateString();
                      const dayTasks = getDayTasks(day);
                      return (
                        <button
                          key={idx}
                          className={`${styles.mobileDayPill} ${isSelected ? styles.mobileDayPillSelected : ''} ${isToday && !isSelected ? styles.mobileDayPillToday : ''}`}
                          onClick={() => setSelectedMobileDay(day)}
                        >
                          <span className={styles.mobileDayName}>{day.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
                          <span className={styles.mobileDayNum}>{day.getDate()}</span>
                          {dayTasks.length > 0 && <span className={styles.mobileDayDot}></span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected Day Tasks */}
                  <div className={styles.mobileSection}>
                    <h3 className={styles.mobileSectionTitle}>
                      {(selectedMobileDay || new Date()).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </h3>
                    <div className={styles.mobileTaskList}>
                      {getDayTasks(selectedMobileDay || new Date()).length === 0 ? (
                        <p className={styles.mobileEmptyState}>Aucune tâche ce jour</p>
                      ) : (
                        getDayTasks(selectedMobileDay || new Date()).map((item, idx) => {
                          const currentDay = selectedMobileDay || new Date();
                          const assignment = getTaskAssignment(item.task.id, currentDay);
                          const assignedUserIds = assignment?.userIds || [];
                          const isMyTask = assignedUserIds.includes(currentUser || '');
                          const isAssigned = assignedUserIds.length > 0;
                          const iAmBusy = currentUser ? isUserBusyAtTime(currentUser, currentDay, item.timeSlot) : false;
                          const firstAssignedUser = assignedUserIds[0];
                          const assignedNames = assignedUserIds.map(id => users.find(u => u.id === id)?.name).filter(Boolean).join(', ');
                          const pointsDivider = isMyTask ? assignedUserIds.length : 1;
                          const displayPoints = Math.round(item.points / pointsDivider);
                          
                          return (
                            <div key={`day-task-${idx}`} className={styles.mobileTaskItemExpanded}>
                              <div className={styles.mobileTaskRow}>
                                <div 
                                  className={styles.mobileTaskColor}
                                  style={{ backgroundColor: isAssigned ? `hsl(${(users.findIndex(u => u.id === firstAssignedUser) * 60) % 360}, 60%, 50%)` : 'var(--color-muted)' }}
                                />
                                <div className={styles.mobileTaskLeft}>
                                  <span className={styles.mobileTaskTitle}>{item.task.title}</span>
                                  <span className={styles.mobileTaskMeta}>
                                    {item.timeSlot} · {isAssigned ? assignedNames || 'Inconnu' : 'Libre'}
                                  </span>
                                </div>
                                <span className={styles.mobileTaskPoints}>+{displayPoints}{assignedUserIds.length > 1 && isMyTask ? ` (÷${assignedUserIds.length})` : ''}</span>
                              </div>
                              <div className={styles.mobileTaskActions}>
                                {isMyTask ? (
                                  <button 
                                    className={styles.mobileUnregisterBtn}
                                    onClick={() => unclaimTask(item.task.id, currentDay)}
                                  >
                                    <Icon name="x" size={14} />
                                    Se désinscrire
                                  </button>
                                ) : iAmBusy ? (
                                  <span className={styles.mobileBusyLabel}>
                                    <Icon name="clock" size={14} />
                                    Occupé(e)
                                  </span>
                                ) : (
                                  <button 
                                    className={styles.mobileRegisterBtn}
                                    onClick={() => claimTask(item.task.id, currentDay)}
                                  >
                                    <Icon name="check" size={14} />
                                    {isAssigned ? 'Rejoindre' : "S'inscrire"}
                                  </button>
                                )}
                                {isAssigned && !isMyTask && (
                                  <span className={styles.mobileAssignedLabel}>
                                    Pris par {assignedNames}
                                  </span>
                                )}
                                {currentUserRecord?.isAdmin && (() => {
                                  const mobileTaskKey = getTaskAssignmentKey(item.task.id, currentDay);
                                  return (
                                    <div className={styles.adminAssignWrapper}>
                                      <button
                                        className={styles.adminAssignBtn}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setAdminAssignMenu(prev =>
                                            prev?.key === mobileTaskKey ? null : { taskId: item.task.id, date: currentDay, key: mobileTaskKey }
                                          );
                                        }}
                                        title="Gérer l'inscription"
                                      >
                                        <Icon name="users" size={14} />
                                      </button>
                                      {adminAssignMenu?.key === mobileTaskKey && (
                                        <div className={styles.adminAssignDropdown}>
                                          <div className={styles.adminAssignHeader}>Inscrire un membre</div>
                                          {familyUsers.filter(u => u.familyId === selectedFamily).map(member => {
                                            const isMemberAssigned = assignedUserIds.includes(member.id);
                                            return (
                                              <button
                                                key={member.id}
                                                className={`${styles.adminAssignOption} ${isMemberAssigned ? styles.adminAssignOptionActive : ''}`}
                                                onClick={() => isMemberAssigned
                                                  ? unassignForUser(item.task.id, currentDay, member.id)
                                                  : assignForUser(item.task.id, currentDay, member.id)
                                                }
                                              >
                                                <span>{member.name}</span>
                                                {isMemberAssigned && <Icon name="check" size={12} />}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile Points */}
              {activeTab === "points" && (
                <div className={styles.mobileTab}>
                  {/* Weekly Goal Card */}
                  {currentUser && (
                    <div className={styles.mobileGoalCard}>
                      <div className={styles.mobileGoalHeader}>
                        <Icon name="listCheck" size={18} />
                        <span>Objectif hebdomadaire</span>
                      </div>
                      <div className={styles.mobileGoalProgress}>
                        <div className={styles.mobileGoalValues}>
                          <span className={styles.mobileGoalCurrent}>
                            {getUserPointsForWeek(currentUser, getWeekStart(new Date()))}
                          </span>
                          <span className={styles.mobileGoalSeparator}>/</span>
                          <span className={styles.mobileGoalTarget}>
                            {getQuotaWithAbsences(currentUser, getWeekStart(new Date()))} pts
                          </span>
                        </div>
                        <div className={styles.mobileProgressBar}>
                          <div 
                            className={styles.mobileProgressFill}
                            style={{ 
                              width: `${Math.min(100, (getUserPointsForWeek(currentUser, getWeekStart(new Date())) / Math.max(1, getQuotaWithAbsences(currentUser, getWeekStart(new Date())))) * 100)}%`,
                              backgroundColor: getUserPointsForWeek(currentUser, getWeekStart(new Date())) >= getQuotaWithAbsences(currentUser, getWeekStart(new Date())) ? 'var(--color-success)' : 'var(--color-primary)'
                            }}
                          />
                        </div>
                        <div className={styles.mobileGoalDetails}>
                          <span>
                            {getUserPointsForWeek(currentUser, getWeekStart(new Date())) >= getQuotaWithAbsences(currentUser, getWeekStart(new Date())) 
                              ? <><Icon name="check" size={14} style={{ color: 'var(--color-success)', marginRight: '4px' }} />Objectif atteint !</>
                              : `${getQuotaWithAbsences(currentUser, getWeekStart(new Date())) - getUserPointsForWeek(currentUser, getWeekStart(new Date()))} pts restants`
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Leaderboard */}
                  <div className={styles.mobileLeaderboard}>
                    {users.sort((a, b) => (getUserTotalPoints(b.id) - getUserTotalPoints(a.id))).map((user, idx) => (
                      <button 
                        key={user.id} 
                        className={`${styles.mobileLeaderItem} ${idx === 0 ? styles.mobileLeaderFirst : ''} ${user.id === currentUser ? styles.mobileLeaderMe : ''} ${mobileSelectedUser === user.id ? styles.mobileLeaderSelected : ''}`}
                        onClick={() => setMobileSelectedUser(mobileSelectedUser === user.id ? null : user.id)}
                      >
                        <span className={styles.mobileLeaderRank}>#{idx + 1}</span>
                        <div 
                          className={styles.mobileLeaderAvatar}
                          style={{ backgroundColor: `hsl(${(users.indexOf(user) * 60) % 360}, 60%, 50%)` }}
                        >
                          {user.name.charAt(0)}
                        </div>
                        <span className={styles.mobileLeaderName}>{user.name} {user.id === currentUser && '(moi)'}</span>
                        <span className={styles.mobileLeaderPoints}>{getUserTotalPoints(user.id)} pts</span>
                      </button>
                    ))}
                  </div>

                  {/* User Activity - Only shown when a user is selected */}
                  {mobileSelectedUser && (
                    <div className={styles.mobileSection}>
                      <div className={styles.mobileUserActivityHeader}>
                        <h3 className={styles.mobileSectionTitle}>
                          <Icon name="clock" size={16} />
                          Activité de {users.find(u => u.id === mobileSelectedUser)?.name}
                        </h3>
                        <button 
                          className={styles.mobileCloseBtn}
                          onClick={() => setMobileSelectedUser(null)}
                        >
                          <Icon name="x" size={16} />
                        </button>
                      </div>
                      <div className={styles.mobileActivityList}>
                        {getUserPointsHistory(mobileSelectedUser).length === 0 ? (
                          <p className={styles.mobileEmptyState}>Aucune activité</p>
                        ) : (
                          getUserPointsHistory(mobileSelectedUser).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10).map((item, idx) => (
                            <div key={idx} className={styles.mobileActivityItem}>
                              <div className={styles.mobileActivityInfo}>
                                <span className={styles.mobileActivityTitle}>{item.title}</span>
                                <span className={styles.mobileActivityMeta}>{new Date(item.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                              </div>
                              <span className={styles.mobileActivityPoints}>+{item.points}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Mobile Tasks */}
              {activeTab === "taches" && (
                <div className={styles.mobileTab}>
                  {/* Header with + button */}
                  <div className={styles.mobileTasksHeader}>
                    <div className={styles.mobileSearchBar}>
                      <Icon name="search" size={16} />
                      <input 
                        type="text" 
                        placeholder="Rechercher une tâche..."
                        value={taskSearch}
                        onChange={(e) => setTaskSearch(e.target.value)}
                      />
                    </div>
                    <button 
                      className={`${styles.mobileAddTaskBtn} ${mobileShowTaskForm ? styles.mobileAddTaskBtnActive : ''}`}
                      onClick={() => setMobileShowTaskForm(!mobileShowTaskForm)}
                    >
                      <Icon name={mobileShowTaskForm ? "x" : "plus"} size={20} />
                    </button>
                  </div>

                  {/* Mobile Task Creation Form (collapsible) */}
                  {mobileShowTaskForm && (
                    <div className={styles.mobileCreateTaskCard}>
                      <h4 className={styles.mobileCreateTitle}>
                        <Icon name="plus" size={14} />
                        Nouvelle tâche
                      </h4>
                      <input
                        type="text"
                        className={styles.mobileInput}
                        placeholder="Nom de la tâche"
                        value={newTask.title}
                        onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      />
                      <div className={styles.mobileInputRowEqual}>
                        <div className={styles.mobileInputGroupCompact}>
                          <label>Durée</label>
                          <div className={styles.mobileInputWithUnit}>
                            <input
                              type="number"
                              value={newTask.duration || ''}
                              onChange={(e) => setNewTask({ ...newTask, duration: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                              min={5}
                              max={240}
                            />
                            <span>min</span>
                          </div>
                        </div>
                        <div className={styles.mobileInputGroupCompact}>
                          <label>Pénibilité</label>
                          <div className={styles.mobileInputWithUnit}>
                            <input
                              type="number"
                              value={newTask.penibility || ''}
                              onChange={(e) => setNewTask({ ...newTask, penibility: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                              min={1}
                              max={100}
                            />
                            <span>%</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Schedule slots */}
                      <div className={styles.mobileScheduleSection}>
                        <label className={styles.mobileScheduleLabel}>Créneaux</label>
                        <div className={styles.mobileScheduleAdd}>
                          <select
                            className={styles.mobileSelectCompact}
                            value={newTaskDay}
                            onChange={(e) => setNewTaskDay(e.target.value)}
                          >
                            {dayOptions.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                          <input
                            type="time"
                            className={styles.mobileTimeInput}
                            value={newTaskTime}
                            onChange={(e) => setNewTaskTime(e.target.value)}
                          />
                          <button 
                            className={styles.mobileAddScheduleBtn}
                            onClick={() => {
                              const slot = `${newTaskDay} · ${newTaskTime}`;
                              if (!mobileNewTaskSchedules.includes(slot)) {
                                setMobileNewTaskSchedules([...mobileNewTaskSchedules, slot]);
                              }
                            }}
                          >
                            <Icon name="plus" size={14} />
                          </button>
                        </div>
                        {mobileNewTaskSchedules.length > 0 && (
                          <div className={styles.mobileScheduleList}>
                            {mobileNewTaskSchedules.map((slot, idx) => (
                              <div key={idx} className={styles.mobileScheduleChip}>
                                <span>{slot}</span>
                                <button onClick={() => setMobileNewTaskSchedules(mobileNewTaskSchedules.filter((_, i) => i !== idx))}>
                                  <Icon name="x" size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <button 
                        className={styles.mobileCreateBtnFull} 
                        onClick={() => {
                          if (mobileNewTaskSchedules.length > 0) {
                            setNewTaskSchedules(mobileNewTaskSchedules);
                          }
                          addTask();
                          setMobileNewTaskSchedules([]);
                          setMobileShowTaskForm(false);
                        }}
                      >
                        <Icon name="plus" size={16} />
                        Créer la tâche
                      </button>
                      {paramMessage && <p className={styles.mobileError}>{paramMessage}</p>}
                    </div>
                  )}

                  {/* All Tasks List */}
                  <div className={styles.mobileSection}>
                    {/* Evaluation Progress Banner */}
                    {currentUser && (
                      <div className={`${styles.mobileEvalBanner} ${getUserEvaluationCount(currentUser) >= tasks.length ? styles.mobileEvalBannerSuccess : ''}`}>
                        <Icon name={getUserEvaluationCount(currentUser) >= tasks.length ? "check" : "sliders"} size={14} />
                        <span>
                          {getUserEvaluationCount(currentUser) >= tasks.length 
                            ? "Vous avez évalué toutes les tâches ✓"
                            : `Évaluations: ${getUserEvaluationCount(currentUser)}/${tasks.length} tâches`
                          }
                        </span>
                      </div>
                    )}
                    <h3 className={styles.mobileSectionTitle}>
                      <Icon name="clipboardList" size={16} />
                      Toutes les tâches ({tasks.filter(t => t.title.toLowerCase().includes(taskSearch.toLowerCase())).length})
                    </h3>
                    <div className={styles.mobileTaskList}>
                      {tasks.filter(t => t.title.toLowerCase().includes(taskSearch.toLowerCase())).map((task) => (
                        <div key={task.id} className={styles.mobileTaskItemCompact}>
                        {editingTaskId === task.id ? (
                          // Edit Mode
                          <div className={styles.mobileEditForm}>
                            <input
                              type="text"
                              className={styles.mobileInput}
                              value={editTaskDraft.title}
                              onChange={(e) => setEditTaskDraft({ ...editTaskDraft, title: e.target.value })}
                            />
                            <div className={styles.mobileInputRowEqual}>
                              <div className={styles.mobileInputGroupCompact}>
                                <label>Durée</label>
                                <div className={styles.mobileInputWithUnit}>
                                  <input
                                    type="number"
                                    value={editTaskDraft.duration || ''}
                                    onChange={(e) => setEditTaskDraft({ ...editTaskDraft, duration: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                                    min={5}
                                    max={240}
                                  />
                                  <span>min</span>
                                </div>
                              </div>
                              <div className={styles.mobileInputGroupCompact}>
                                <label>Pénibilité</label>
                                <div className={styles.mobileInputWithUnit}>
                                  <input
                                    type="number"
                                    value={editTaskDraft.penibility || ''}
                                    onChange={(e) => setEditTaskDraft({ ...editTaskDraft, penibility: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                                    min={1}
                                    max={100}
                                  />
                                  <span>%</span>
                                </div>
                              </div>
                            </div>
                            {/* Schedule editing */}
                            <div className={styles.mobileScheduleSection}>
                              <label className={styles.mobileScheduleLabel}>Créneaux</label>
                              <div className={styles.mobileScheduleList}>
                                {(task.schedules || [task.slot]).map((slot, idx) => (
                                  <div key={idx} className={styles.mobileScheduleChip}>
                                    <span>{slot}</span>
                                    {(task.schedules?.length || 1) > 1 && (
                                      <button onClick={() => removeScheduleFromTask(task.id, slot)}>
                                        <Icon name="x" size={10} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <div className={styles.mobileScheduleAdd}>
                                <select
                                  className={styles.mobileSelectCompact}
                                  value={getScheduleDraft(task.id).day}
                                  onChange={(e) => updateScheduleDraft(task.id, { day: e.target.value })}
                                >
                                  {dayOptions.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                                <input
                                  type="time"
                                  className={styles.mobileTimeInput}
                                  value={getScheduleDraft(task.id).time}
                                  onChange={(e) => updateScheduleDraft(task.id, { time: e.target.value })}
                                />
                                <button 
                                  className={styles.mobileAddScheduleBtn}
                                  onClick={() => addScheduleToTask(task.id)}
                                >
                                  <Icon name="plus" size={14} />
                                </button>
                              </div>
                            </div>
                            <div className={styles.mobileEditActions}>
                              <button className={styles.mobileSaveBtn} onClick={saveEditTask}>
                                <Icon name="check" size={14} />
                                Sauver
                              </button>
                              <button className={styles.mobileCancelBtn} onClick={cancelEditTask}>
                                <Icon name="x" size={14} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          // View Mode - Compact single line
                          <div className={styles.mobileTaskCompactRow}>
                            <span className={styles.mobileTaskTitleCompact}>{task.title}</span>
                            <span className={styles.mobileTaskMetaCompact}>{task.duration}min</span>
                            <span className={styles.mobileTaskBadgeSmall}>{calculateTaskPoints(task)}pts</span>
                            <button 
                              className={`${styles.mobileEvalBtnSmall} ${getMyEvaluation(task.id) ? styles.mobileEvalDone : ''}`}
                              onClick={() => {
                                const myEval = getMyEvaluation(task.id);
                                setPendingEvaluation({
                                  duration: myEval?.duration ?? task.duration,
                                  penibility: myEval?.penibility ?? task.penibility
                                });
                                setShowEvaluationModal(task.id);
                              }}
                              title={getMyEvaluation(task.id) ? "Modifier mon évaluation" : "Évaluer cette tâche"}
                            >
                              <Icon name={getMyEvaluation(task.id) ? "check" : "sliders"} size={12} />
                            </button>
                            <button className={styles.mobileEditBtnSmall} onClick={() => startEditTask(task)}>
                              <Icon name="pen" size={12} />
                            </button>
                            <button className={styles.mobileDeleteBtnSmall} onClick={() => deleteTask(task.id)}>
                              <Icon name="trash" size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile Calendar */}
              {activeTab === "dispos" && (
                <div className={styles.mobileTab}>
                  {/* View selector */}
                  <div className={styles.mobileCalendarViewSelector}>
                    <button 
                      className={`${styles.mobileViewBtn} ${mobileCalendarView === 'month' ? styles.mobileViewBtnActive : ''}`}
                      onClick={() => setMobileCalendarView('month')}
                    >Mois</button>
                    <button 
                      className={`${styles.mobileViewBtn} ${mobileCalendarView === 'week' ? styles.mobileViewBtnActive : ''}`}
                      onClick={() => setMobileCalendarView('week')}
                    >Semaine</button>
                    <button 
                      className={`${styles.mobileViewBtn} ${mobileCalendarView === 'day' ? styles.mobileViewBtnActive : ''}`}
                      onClick={() => setMobileCalendarView('day')}
                    >Jour</button>
                  </div>

                  <div className={styles.mobileCalendarHeader}>
                    <button onClick={() => {
                      if (mobileCalendarView === 'month') {
                        setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1));
                      } else if (mobileCalendarView === 'week') {
                        const newDate = new Date(selectedCalendarDay || new Date());
                        newDate.setDate(newDate.getDate() - 7);
                        setSelectedCalendarDay(newDate);
                        setCalendarMonth(new Date(newDate.getFullYear(), newDate.getMonth()));
                      } else {
                        const newDate = new Date(selectedCalendarDay || new Date());
                        newDate.setDate(newDate.getDate() - 1);
                        setSelectedCalendarDay(newDate);
                        setCalendarMonth(new Date(newDate.getFullYear(), newDate.getMonth()));
                      }
                    }} className={styles.mobileNavBtn}>
                      <Icon name="chevronLeft" size={20} />
                    </button>
                    <span className={styles.mobileMonthLabel}>
                      {mobileCalendarView === 'day' && selectedCalendarDay 
                        ? selectedCalendarDay.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
                        : mobileCalendarView === 'week' && selectedCalendarDay
                        ? `Sem. du ${getWeekStart(selectedCalendarDay).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                        : calendarMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                      }
                    </span>
                    <button onClick={() => {
                      if (mobileCalendarView === 'month') {
                        setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1));
                      } else if (mobileCalendarView === 'week') {
                        const newDate = new Date(selectedCalendarDay || new Date());
                        newDate.setDate(newDate.getDate() + 7);
                        setSelectedCalendarDay(newDate);
                        setCalendarMonth(new Date(newDate.getFullYear(), newDate.getMonth()));
                      } else {
                        const newDate = new Date(selectedCalendarDay || new Date());
                        newDate.setDate(newDate.getDate() + 1);
                        setSelectedCalendarDay(newDate);
                        setCalendarMonth(new Date(newDate.getFullYear(), newDate.getMonth()));
                      }
                    }} className={styles.mobileNavBtn}>
                      <Icon name="chevronRight" size={20} />
                    </button>
                  </div>

                  {/* Month View */}
                  {mobileCalendarView === 'month' && (
                    <div className={styles.mobileCalendarGrid}>
                      {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                        <div key={i} className={styles.mobileCalendarDayName}>{d}</div>
                      ))}
                      {generateCalendarDays(calendarMonth).map((day, idx) => {
                        const dayEvents = day ? getEventsForDate(day) : [];
                        const uniqueUserColors = day ? [...new Set(dayEvents.map(e => {
                          const member = calendarMembers.find(m => m.userId === e.userId);
                          return member?.color || `hsl(${(users.findIndex(u => u.id === e.userId) * 60) % 360}, 60%, 50%)`;
                        }))] : [];
                        const isSelected = day && selectedCalendarDay && day.toDateString() === selectedCalendarDay.toDateString();
                        return (
                          <button 
                            key={idx} 
                            className={`${styles.mobileCalendarDay} ${day && day.toDateString() === new Date().toDateString() ? styles.mobileCalendarToday : ''} ${isSelected ? styles.mobileCalendarSelected : ''}`}
                            onClick={() => day && setSelectedCalendarDay(day)}
                            disabled={!day}
                          >
                            {day?.getDate()}
                            {uniqueUserColors.length > 0 && (
                              <div className={styles.mobileCalendarDots}>
                                {uniqueUserColors.slice(0, 3).map((color, i) => (
                                  <span key={i} className={styles.mobileCalendarDotColored} style={{ backgroundColor: color }}></span>
                                ))}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Selected Day Events (for month view) */}
                  {mobileCalendarView === 'month' && selectedCalendarDay && (
                    <div className={styles.mobileSelectedDayEvents}>
                      <h4 className={styles.mobileSelectedDayTitle}>
                        {selectedCalendarDay.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </h4>
                      {getEventsForDate(selectedCalendarDay).length === 0 ? (
                        <p className={styles.mobileEmptyState}>Aucune indisponibilité ce jour</p>
                      ) : (
                        <div className={styles.mobileSelectedDayList}>
                          {getEventsForDate(selectedCalendarDay).map((event, idx) => {
                            const member = calendarMembers.find(m => m.userId === event.userId);
                            const user = users.find(u => u.id === event.userId);
                            return (
                              <div key={idx} className={styles.mobileDayEvent}>
                                <div 
                                  className={styles.mobileDayEventColor}
                                  style={{ backgroundColor: member?.color || `hsl(${(users.findIndex(u => u.id === event.userId) * 60) % 360}, 60%, 50%)` }}
                                />
                                <div className={styles.mobileDayEventInfo}>
                                  <span className={styles.mobileDayEventTitle}>{event.summary}</span>
                                  <span className={styles.mobileDayEventTime}>
                                    {event.allDay ? 'Toute la journée' : `${new Date(event.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - ${new Date(event.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                                  </span>
                                  {user && <span className={styles.mobileDayEventUser}>{user.name}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Week View */}
                  {mobileCalendarView === 'week' && (
                    <div className={styles.mobileWeekView}>
                      {(() => {
                        const weekStart = getWeekStart(selectedCalendarDay || new Date());
                        const days = Array.from({ length: 7 }, (_, i) => {
                          const d = new Date(weekStart);
                          d.setDate(d.getDate() + i);
                          return d;
                        });
                        return days.map((day, idx) => {
                          const dayEvents = getEventsForDate(day);
                          const isToday = day.toDateString() === new Date().toDateString();
                          const isSelected = selectedCalendarDay && day.toDateString() === selectedCalendarDay.toDateString();
                          return (
                            <button 
                              key={idx} 
                              className={`${styles.mobileWeekDay} ${isToday ? styles.mobileWeekDayToday : ''} ${isSelected ? styles.mobileWeekDaySelected : ''}`}
                              onClick={() => setSelectedCalendarDay(day)}
                            >
                              <div className={styles.mobileWeekDayHeader}>
                                <span className={styles.mobileWeekDayName}>{day.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
                                <span className={styles.mobileWeekDayNum}>{day.getDate()}</span>
                                {dayEvents.length > 0 && (
                                  <div className={styles.mobileWeekDayDots}>
                                    {[...new Set(dayEvents.map(e => {
                                      const member = calendarMembers.find(m => m.userId === e.userId);
                                      return member?.color || `hsl(${(users.findIndex(u => u.id === e.userId) * 60) % 360}, 60%, 50%)`;
                                    }))].slice(0, 3).map((color, i) => (
                                      <span key={i} className={styles.mobileWeekDayDot} style={{ backgroundColor: color }}></span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className={styles.mobileWeekDayEvents}>
                                {dayEvents.slice(0, 3).map((event, i) => {
                                  const member = calendarMembers.find(m => m.userId === event.userId);
                                  return (
                                    <div 
                                      key={i} 
                                      className={styles.mobileWeekEvent}
                                      style={{ borderLeftColor: member?.color || 'var(--color-primary)' }}
                                    >
                                      <span className={styles.mobileWeekEventTitle}>{event.summary}</span>
                                    </div>
                                  );
                                })}
                                {dayEvents.length > 3 && <span className={styles.mobileWeekMore}>+{dayEvents.length - 3}</span>}
                              </div>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  )}

                  {/* Selected Day Events (for week view) */}
                  {mobileCalendarView === 'week' && selectedCalendarDay && (
                    <div className={styles.mobileSelectedDayEvents}>
                      <h4 className={styles.mobileSelectedDayTitle}>
                        {selectedCalendarDay.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </h4>
                      {getEventsForDate(selectedCalendarDay).length === 0 ? (
                        <p className={styles.mobileEmptyState}>Aucune indisponibilité ce jour</p>
                      ) : (
                        <div className={styles.mobileSelectedDayList}>
                          {getEventsForDate(selectedCalendarDay).map((event, idx) => {
                            const member = calendarMembers.find(m => m.userId === event.userId);
                            const user = users.find(u => u.id === event.userId);
                            return (
                              <div key={idx} className={styles.mobileDayEvent}>
                                <div 
                                  className={styles.mobileDayEventColor}
                                  style={{ backgroundColor: member?.color || `hsl(${(users.findIndex(u => u.id === event.userId) * 60) % 360}, 60%, 50%)` }}
                                />
                                <div className={styles.mobileDayEventInfo}>
                                  <span className={styles.mobileDayEventTitle}>{event.summary}</span>
                                  <span className={styles.mobileDayEventTime}>
                                    {event.allDay ? 'Toute la journée' : `${new Date(event.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - ${new Date(event.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                                  </span>
                                  {user && <span className={styles.mobileDayEventUser}>{user.name}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Day View */}
                  {mobileCalendarView === 'day' && selectedCalendarDay && (
                    <div className={styles.mobileDayView}>
                      {getEventsForDate(selectedCalendarDay).length === 0 ? (
                        <p className={styles.mobileEmptyState}>Aucun événement ce jour</p>
                      ) : (
                        getEventsForDate(selectedCalendarDay).map((event, idx) => {
                          const member = calendarMembers.find(m => m.userId === event.userId);
                          const user = users.find(u => u.id === event.userId);
                          return (
                            <div key={idx} className={styles.mobileDayEvent}>
                              <div 
                                className={styles.mobileDayEventColor}
                                style={{ backgroundColor: member?.color || `hsl(${(users.findIndex(u => u.id === event.userId) * 60) % 360}, 60%, 50%)` }}
                              />
                              <div className={styles.mobileDayEventInfo}>
                                <span className={styles.mobileDayEventTitle}>{event.summary}</span>
                                <span className={styles.mobileDayEventTime}>
                                  {event.allDay ? 'Toute la journée' : `${new Date(event.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - ${new Date(event.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                                </span>
                                {user && <span className={styles.mobileDayEventUser}>{user.name}</span>}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <nav className={styles.bottomNav}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`${styles.bottomNavItem} ${activeTab === tab.id ? styles.bottomNavItemActive : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon name={tab.icon} size={22} />
                  <span>{tab.shortLabel}</span>
                </button>
              ))}
            </nav>

            {/* Mobile Delegation Modal */}
            {mobileDelegationModal && (
              <div className={styles.mobileDelegationOverlay}>
                <div className={styles.mobileDelegationModal}>
                  <h3 className={styles.mobileDelegationTitle}>Qui a fait cette tâche ?</h3>
                  <div className={styles.mobileDelegationOptions}>
                    {users.filter(u => u.id !== currentUser).map(user => (
                      <button
                        key={user.id}
                        className={styles.mobileDelegationOption}
                        onClick={() => {
                          delegateTask(mobileDelegationModal.taskId, mobileDelegationModal.date, user.id);
                          setMobileDelegationModal(null);
                        }}
                      >
                        <div 
                          className={styles.mobileDelegationAvatar}
                          style={{ backgroundColor: `hsl(${users.indexOf(user) * 60 % 360}, 60%, 50%)` }}
                        >
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <span>{user.name}</span>
                      </button>
                    ))}
                    <button
                      className={`${styles.mobileDelegationOption} ${styles.mobileDelegationNobody}`}
                      onClick={() => {
                        // Mark as not done by anyone - remove from validation and clear assignment
                        const key = getTaskAssignmentKey(mobileDelegationModal.taskId, mobileDelegationModal.date);
                        setTaskAssignments(prev => ({
                          ...prev,
                          [key]: { date: prev[key]?.date || '', userIds: [] }
                        }));
                        // Remove from validated tasks
                        const year = mobileDelegationModal.date.getFullYear();
                        const month = String(mobileDelegationModal.date.getMonth() + 1).padStart(2, '0');
                        const day = String(mobileDelegationModal.date.getDate()).padStart(2, '0');
                        const dateStr = `${year}-${month}-${day}`;
                        setValidatedTasks(prev => prev.filter(v => 
                          !(v.taskId === mobileDelegationModal.taskId && v.date === dateStr && v.userId === currentUser)
                        ));
                        setMobileDelegationModal(null);
                      }}
                    >
                      <div className={styles.mobileDelegationAvatarNobody}>
                        <Icon name="x" size={16} />
                      </div>
                      <span>Personne</span>
                    </button>
                  </div>
                  <button
                    className={styles.mobileDelegationCancel}
                    onClick={() => setMobileDelegationModal(null)}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {/* Mobile Evaluation Modal */}
            {showEvaluationModal && (
              <div className={styles.mobileDelegationOverlay}>
                <div className={styles.mobileEvaluationModal}>
                  <h3 className={styles.mobileDelegationTitle}>
                    Mon évaluation
                    <span className={styles.mobileEvalSubtitle}>
                      {tasks.find(t => t.id === showEvaluationModal)?.title}
                    </span>
                  </h3>
                  <p className={styles.mobileEvalExplain}>
                    Indiquez <strong>votre ressenti</strong> sur la durée et la pénibilité de cette tâche. Ces données servent à l'auto-attribution intelligente.
                  </p>
                  
                  <div className={styles.mobileEvalInputs}>
                    <div className={styles.mobileEvalInputGroup}>
                      <label>Durée estimée</label>
                      <div className={styles.mobileInputWithUnit}>
                        <input
                          type="number"
                          value={pendingEvaluation.duration}
                          onChange={(e) => setPendingEvaluation(prev => ({ ...prev, duration: parseInt(e.target.value) || 0 }))}
                          min={5}
                          max={240}
                        />
                        <span>min</span>
                      </div>
                    </div>
                    <div className={styles.mobileEvalInputGroup}>
                      <label>Pénibilité ressentie</label>
                      <div className={styles.mobileInputWithUnit}>
                        <input
                          type="number"
                          value={pendingEvaluation.penibility}
                          onChange={(e) => setPendingEvaluation(prev => ({ ...prev, penibility: parseInt(e.target.value) || 0 }))}
                          min={1}
                          max={100}
                        />
                        <span>%</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.mobileEvalInfo}>
                    <Icon name="info" size={14} />
                    <span>
                      Points collectifs calculés sur la <strong>médiane</strong> de toutes les évaluations
                    </span>
                  </div>

                  <div className={styles.mobileEvalActions}>
                    <button
                      className={styles.mobileEvalSaveBtn}
                      onClick={() => {
                        saveEvaluation(showEvaluationModal, pendingEvaluation.duration, pendingEvaluation.penibility);
                        setShowEvaluationModal(null);
                      }}
                    >
                      <Icon name="check" size={16} />
                      Enregistrer
                    </button>
                    <button
                      className={styles.mobileDelegationCancel}
                      onClick={() => setShowEvaluationModal(null)}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Desktop view
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brandSection}>
          <img 
            src="/logo/logo_sans_nom.svg" 
            alt="Fam'Planner" 
            className={styles.logo}
            width={88}
            height={88}
          />
          <div>
            <h1 className={styles.brandTitle}>Fam'Planner</h1>
            <p className={styles.brandSubtitle}>Organisation familiale</p>
          </div>
        </div>
        <div className={styles.topActions}>
          <button 
            className={styles.viewToggle}
            onClick={() => setViewMode('mobile')}
            title="Passer en mode Application"
          >
            <Icon name="mobileAlt" size={18} />
            <span className={styles.viewLabel}>App</span>
          </button>
          <button 
            className={styles.themeToggle} 
            onClick={() => {
              const newTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'auto' : 'light';
              setTheme(newTheme);
            }}
            title={`Thème: ${theme === 'light' ? 'Clair' : theme === 'dark' ? 'Sombre' : 'Auto'}`}
          >
            <Icon name={theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'circleHalfStroke'} size={18} />
            <span className={styles.themeLabel}>{theme === 'light' ? 'Clair' : theme === 'dark' ? 'Sombre' : 'Auto'}</span>
          </button>
          <Link href="/settings" className={styles.settingsLink} title="Paramètres">
            <Icon name="gear" size={18} />
          </Link>
          {currentUserEntity && <span className={styles.userChip}>{currentUserEntity.name}</span>}
          <button className={styles.logout} onClick={logout}>Se déconnecter</button>
        </div>
      </header>

      <nav className={styles.tabbar}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? styles.tabButtonActive : styles.tabButton}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {tabContent}

      {/* Desktop Evaluation Modal */}
      {showEvaluationModal && (
        <div className={styles.modalOverlay} onClick={() => setShowEvaluationModal(null)}>
          <div className={styles.evaluationModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.evaluationModalTitle}>
              <Icon name="sliders" size={20} />
              Mon évaluation personnelle
            </h3>
            <p className={styles.evaluationModalSubtitle}>
              {tasks.find(t => t.id === showEvaluationModal)?.title}
            </p>
            <p className={styles.evaluationModalExplain}>
              Indiquez <strong>votre ressenti</strong> sur la durée et la pénibilité de cette tâche. 
              Ces données servent à calculer les points (médiane) et à l'auto-attribution intelligente.
            </p>
            
            <div className={styles.evaluationModalInputs}>
              <div className={styles.evaluationModalField}>
                <label>Durée estimée (minutes)</label>
                <input
                  type="number"
                  value={pendingEvaluation.duration}
                  onChange={(e) => setPendingEvaluation(prev => ({ ...prev, duration: parseInt(e.target.value) || 0 }))}
                  min={5}
                  max={240}
                />
              </div>
              <div className={styles.evaluationModalField}>
                <label>Pénibilité ressentie (%)</label>
                <input
                  type="number"
                  value={pendingEvaluation.penibility}
                  onChange={(e) => setPendingEvaluation(prev => ({ ...prev, penibility: parseInt(e.target.value) || 0 }))}
                  min={1}
                  max={100}
                />
              </div>
            </div>

            <div className={styles.evaluationModalInfo}>
              <Icon name="info" size={14} />
              <span>
                Les points collectifs sont calculés sur la <strong>médiane</strong> de toutes les évaluations.
                L'auto-attribution utilise vos préférences relatives pour équilibrer les tâches.
              </span>
            </div>

            <div className={styles.evaluationModalActions}>
              <button
                className={styles.evaluationModalSave}
                onClick={() => {
                  saveEvaluation(showEvaluationModal, pendingEvaluation.duration, pendingEvaluation.penibility);
                  setShowEvaluationModal(null);
                }}
              >
                <Icon name="check" size={16} />
                Enregistrer
              </button>
              <button
                className={styles.evaluationModalCancel}
                onClick={() => setShowEvaluationModal(null)}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'erreur auto-attribution */}
      {showAutoAssignError && (
        <div className={styles.modalOverlay} onClick={() => setShowAutoAssignError(false)}>
          <div className={styles.autoAssignErrorModal} onClick={e => e.stopPropagation()}>
            <div className={styles.autoAssignErrorIcon}>
              <Icon name="warning" size={32} />
            </div>
            <h3 className={styles.autoAssignErrorTitle}>Évaluations incomplètes</h3>
            <p className={styles.autoAssignErrorText}>
              Tous les membres doivent évaluer toutes les tâches avant l'auto-attribution.
            </p>
            {missingEvaluationUsers.length > 0 && (
              <div style={{ width: '100%', margin: '12px 0' }}>
                {missingEvaluationUsers.map((u, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                    <span style={{ fontWeight: 500 }}>{u.name}</span>
                    <span style={{ color: u.evaluated < u.total ? 'var(--danger-color, #ef4444)' : 'var(--success-color, #22c55e)', fontWeight: 600 }}>
                      {u.evaluated} / {u.total}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className={styles.autoAssignErrorExplain}>
              Chaque membre doit évaluer la durée et la pénibilité de toutes les tâches selon son propre ressenti.
            </p>
            <div className={styles.autoAssignErrorActions}>
              <button
                className={styles.autoAssignErrorBtn}
                onClick={() => {
                  setShowAutoAssignError(false);
                  setActiveTab("taches");
                }}
              >
                <Icon name="sliders" size={16} />
                Évaluer les tâches
              </button>
              <button
                className={styles.autoAssignErrorCancel}
                onClick={() => setShowAutoAssignError(false)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toastMessage && (
        <div className={`${styles.toast} ${toastMessage.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
          <div className={styles.toastMain}>
            <Icon name={toastMessage.type === 'success' ? 'check' : 'warning'} size={18} />
            <span>{toastMessage.text}</span>
            {toastMessage.details && toastMessage.details.length > 0 && (
              <button
                className={`${styles.toastDetailsToggle} ${toastDetailsOpen ? styles.toastDetailsToggleOpen : ''}`}
                onClick={(e) => { e.stopPropagation(); setToastDetailsOpen(v => !v); }}
                aria-label="Voir les détails"
              >
                <Icon name="chevronDown" size={14} />
              </button>
            )}
            <button
              className={styles.toastClose}
              onClick={(e) => { e.stopPropagation(); setToastMessage(null); }}
            >
              <Icon name="xmark" size={14} />
            </button>
          </div>
          {toastDetailsOpen && toastMessage.details && (
            <div className={styles.toastDetails}>
              {toastMessage.details.map((detail, i) => (
                <div key={i} className={styles.toastDetailItem}>{detail}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
