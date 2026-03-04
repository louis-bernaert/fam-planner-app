"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import { Icon } from "../components/Icon";
import { useTranslation } from "../components/LanguageProvider";
import { solveMILP } from "@/lib/autoAssignSolver";
import { resolvePreferences, writePreferencesToLocalStorage, readPreferencesFromLocalStorage, savePreferencesToDB, dispatchPreferencesUpdated } from "../lib/userPreferences";
import type { SolverTaskDay, SolverCostEntry, SolverRotationEntry, SolverMember } from "@/lib/autoAssignSolver.types";

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
  pointDebtEnabled?: boolean;
};

type Task = {
  id: string;
  title: string;
  duration: number;
  penibility: number;
  slot: string;
  schedules?: string[];
  familyId?: string;
  isCooking?: boolean;
  isRecurring?: boolean;
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

// features array is now defined inside PlannerPage so it can use translations

// Internal DB values — always French (stored in database)
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

const timeSlotOptions = ["Matin", "Après-midi", "Soir"];

function uuid() {
  return crypto.randomUUID();
}

function makeFullName(first?: string, last?: string, fallback?: string, defaultLabel: string = "User") {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const combined = [f, l].filter(Boolean).join(" ");
  if (combined) return combined;
  if (fallback?.trim()) return fallback.trim();
  return defaultLabel;
}

export default function PlannerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, language } = useTranslation();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';

  // Translation helpers for slot display (DB stores French values, we translate for display)
  const dayTranslationMap: Record<string, string> = {
    'Lun': t.days.mon, 'Mar': t.days.tue, 'Mer': t.days.wed,
    'Jeu': t.days.thu, 'Ven': t.days.fri, 'Sam': t.days.sat, 'Dim': t.days.sun,
  };
  const timeTranslationMap: Record<string, string> = {
    'Matin': t.timeSlots.morning, 'Après-midi': t.timeSlots.afternoon,
    'Soir': t.timeSlots.evening, 'Journée': t.timeSlots.allDay,
  };
  const translateDay = (day: string): string => dayTranslationMap[day] || day;
  const translateTime = (time: string): string => timeTranslationMap[time] || time;
  const translateSlot = (slot: string): string => {
    const parts = slot.split(' · ');
    if (parts.length === 2) {
      return `${translateDay(parts[0])} · ${translateTime(parts[1])}`;
    }
    return translateDay(slot);
  };

  const features = [
    {
      title: t.planner.weightedTasks,
      text: t.planner.weightedTasksDesc,
      icon: "fa-balance-scale",
    },
    {
      title: t.planner.availabilityIncluded,
      text: t.planner.availabilityIncludedDesc,
      icon: "fa-calendar-check",
    },
    {
      title: t.planner.smartAssignment,
      text: t.planner.smartAssignmentDesc,
      icon: "fa-random",
    },
  ];

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
  const [newTaskTimeMode, setNewTaskTimeMode] = useState<"slot" | "time">("slot");
  const [newTaskTime, setNewTaskTime] = useState<string>("Matin");
  const [newTaskSchedules, setNewTaskSchedules] = useState<string[]>([]);
  const [newTaskIsCooking, setNewTaskIsCooking] = useState(false);
  const [newTaskIsRecurring, setNewTaskIsRecurring] = useState(false);
  const [newUnavailable, setNewUnavailable] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState({ name: "", email: "", password: "", familyId: "" });
  const [authView, setAuthView] = useState<"login" | "signup" | "forgot">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
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
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [localDbEvents, setLocalDbEvents] = useState<any[]>([]);
  const [eventFormData, setEventFormData] = useState({
    title: "",
    date: "",
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    description: "",
    location: "",
    recurrence: "none",
    recurrenceEnd: "",
  });

  // Planificateur state - affiche 2 jours à la fois
  const [plannerStartDate, setPlannerStartDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
const [taskAssignments, setTaskAssignments] = useState<Record<string, { date: string; userIds: string[]; dishes?: Record<string, string>; recurringUsers?: string[] }>>({});

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
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const [suggestionText, setSuggestionText] = useState("");
  const [suggestionMessage, setSuggestionMessage] = useState("");

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
  const [dishModal, setDishModal] = useState<{ taskId: string; date: Date } | null>(null);
  const [dishInput, setDishInput] = useState('');
  const [showFreeTasksNotif, setShowFreeTasksNotif] = useState(true);
  const [showEvalNotif, setShowEvalNotif] = useState(true);
  const [rankingPeriod, setRankingPeriod] = useState<'week' | 'month' | 'all'>('all');
  const [rankingMetric, setRankingMetric] = useState<'points' | 'tasks' | 'time'>('points');

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

  // Lecture des préférences de notification
  useEffect(() => {
    const freePref = localStorage.getItem('notif_freeTasks');
    const evalPref = localStorage.getItem('notif_evalTasks');
    if (freePref === 'false') setShowFreeTasksNotif(false);
    if (evalPref === 'false') setShowEvalNotif(false);
  }, []);

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
    { id: "monespace" as const, label: t.tabs.mySpace, shortLabel: t.tabs.mySpaceShort, icon: "home" as const },
    { id: "planificateur" as const, label: t.tabs.planner, shortLabel: t.tabs.plannerShort, icon: "calendarAlt" as const },
    { id: "points" as const, label: t.tabs.points, shortLabel: t.tabs.pointsShort, icon: "chartBar" as const },
    { id: "taches" as const, label: t.tabs.tasks, shortLabel: t.tabs.tasksShort, icon: "clipboardList" as const },
    { id: "dispos" as const, label: t.tabs.calendar, shortLabel: t.tabs.calendarShort, icon: "calendar" as const },
  ];

  // Calendar functions

  // Recurrence expansion for local events
  const expandLocalEvents = (dbEvents: any[], rangeStart: Date, rangeEnd: Date, members: any[]) => {
    const expanded: any[] = [];
    for (const evt of dbEvents) {
      const [y, m, d] = evt.date.split("-").map(Number);
      const baseDate = new Date(y, m - 1, d);
      const endRecur = evt.recurrenceEnd ? (() => { const [ey, em, ed] = evt.recurrenceEnd.split("-").map(Number); return new Date(ey, em - 1, ed); })() : null;
      const member = members.find((mb: any) => mb.userId === evt.userId);
      const color = member?.color || "#3b82f6";
      const userName = evt.user?.name || t.planner.unknownUser;

      if (evt.recurrence === "none") {
        if (baseDate >= rangeStart && baseDate <= rangeEnd) {
          expanded.push(toDisplayEvent(evt, evt.date, color, userName));
        }
      } else {
        let current = new Date(baseDate);
        const maxDate = endRecur && endRecur < rangeEnd ? endRecur : rangeEnd;
        let safety = 0;
        while (current <= maxDate && safety < 500) {
          if (current >= rangeStart) {
            const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
            expanded.push(toDisplayEvent(evt, dateStr, color, userName));
          }
          current = advanceDate(current, evt.recurrence);
          safety++;
        }
      }
    }
    return expanded;
  };

  const advanceDate = (date: Date, recurrence: string): Date => {
    const next = new Date(date);
    switch (recurrence) {
      case "daily": next.setDate(next.getDate() + 1); break;
      case "weekly": next.setDate(next.getDate() + 7); break;
      case "monthly": next.setMonth(next.getMonth() + 1); break;
      case "yearly": next.setFullYear(next.getFullYear() + 1); break;
    }
    return next;
  };

  const toDisplayEvent = (evt: any, dateStr: string, color: string, userName: string) => {
    const start = evt.allDay ? dateStr : `${dateStr}T${evt.startTime || "00:00"}:00`;
    const end = evt.allDay ? dateStr : (evt.endTime ? `${dateStr}T${evt.endTime}:00` : start);
    return {
      id: `local-${evt.id}-${dateStr}`,
      localEventId: evt.id,
      title: evt.title,
      start,
      end,
      allDay: evt.allDay,
      description: evt.description || "",
      location: evt.location || "",
      color,
      userName,
      userId: evt.userId,
      isLocal: true,
      recurrence: evt.recurrence,
      originalDate: evt.date,
    };
  };

  // Event form handlers
  const openCreateEventForm = (prefilledDate?: Date) => {
    const d = prefilledDate || new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setEventFormData({
      title: "",
      date: dateStr,
      startTime: "09:00",
      endTime: "10:00",
      allDay: false,
      description: "",
      location: "",
      recurrence: "none",
      recurrenceEnd: "",
    });
    setEditingEvent(null);
    setShowEventForm(true);
  };

  const openEditEventForm = (event: any) => {
    if (!event.isLocal) return;
    setEventFormData({
      title: event.title,
      date: event.originalDate || event.start.substring(0, 10),
      startTime: event.allDay ? "09:00" : (event.start.length > 10 ? event.start.substring(11, 16) : "09:00"),
      endTime: event.allDay ? "10:00" : (event.end && event.end.length > 10 ? event.end.substring(11, 16) : "10:00"),
      allDay: event.allDay,
      description: event.description || "",
      location: event.location || "",
      recurrence: event.recurrence || "none",
      recurrenceEnd: "",
    });
    setEditingEvent(event);
    setShowEventForm(true);
  };

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedFamily) return;

    const payload = {
      ...eventFormData,
      userId: currentUser,
      familyId: selectedFamily,
      ...(editingEvent ? { id: editingEvent.localEventId } : {}),
    };

    const method = editingEvent ? "PUT" : "POST";
    try {
      const res = await fetch("/api/calendar-events", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowEventForm(false);
        setEditingEvent(null);
        loadCalendarData();
      }
    } catch (error) {
      console.error("Failed to save event", error);
    }
  };

  const handleEventDelete = async (eventId?: string) => {
    const id = eventId || editingEvent?.localEventId;
    if (!id || !currentUser) return;
    try {
      const res = await fetch(
        `/api/calendar-events?id=${id}&userId=${currentUser}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setShowEventForm(false);
        setEditingEvent(null);
        setSelectedEvent(null);
        loadCalendarData();
      }
    } catch (error) {
      console.error("Failed to delete event", error);
    }
  };

  const loadCalendarData = async () => {
    if (!selectedFamily) return;

    try {
      // Load members with calendar settings
      const membersRes = await fetch(`/api/calendar/members?familyId=${selectedFamily}`);
      let membersData: any[] = [];
      if (membersRes.ok) {
        membersData = await membersRes.json();
        setCalendarMembers(membersData);
      }

      // Load iCal events
      const eventsRes = await fetch(`/api/calendar?familyId=${selectedFamily}`);
      let icalEvents: any[] = [];
      if (eventsRes.ok) {
        icalEvents = await eventsRes.json();
        icalEvents = icalEvents.map((e: any) => ({ ...e, isLocal: false }));
      }

      // Load local DB events
      const localRes = await fetch(`/api/calendar-events?familyId=${selectedFamily}`);
      let localExpandedEvents: any[] = [];
      if (localRes.ok) {
        const dbEvents = await localRes.json();
        setLocalDbEvents(dbEvents);
        const rangeStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 2, 1);
        const rangeEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, 0);
        localExpandedEvents = expandLocalEvents(dbEvents, rangeStart, rangeEnd, membersData);
      }

      // Merge both sources
      setCalendarEvents([...icalEvents, ...localExpandedEvents]);
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
        alert(t.planner.saveError + ": " + (errorData.error || t.common.error));
      }
    } catch (error) {
      console.error("Failed to update member settings", error);
      alert(t.planner.saveError);
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
    return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
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
    return date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
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
        // Handle legacy Matin/Soir format and named slots
        if (timePart === 'Matin') return '08:00';
        if (timePart === 'Après-midi') return '14:00';
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
    if (time === '08:00') return t.timeSlots.morning;
    if (time === '14:00') return t.timeSlots.afternoon;
    if (time === '18:00') return t.timeSlots.evening;
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
          unavailabilities.push({ time: t.planner.allDayEvent, summary: event.title || '' });
        }
      } else if (eventStart.toDateString() === date.toDateString()) {
        const startStr = eventStart.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
        const endStr = eventEnd.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
        unavailabilities.push({ time: `${startStr} - ${endStr}`, summary: event.title || '' });
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
        alert(t.planner.youAreBusy);
        return;
      }
    }

    // If cooking task, open dish modal instead
    if (task?.isCooking) {
      setDishModal({ taskId, date });
      setDishInput('');
      return;
    }

    // Non-cooking task: register directly
    await registerForTask(taskId, date, null);
  };

  const confirmDishAndClaim = async () => {
    if (!dishModal) return;
    const dish = dishInput.trim() || null;
    setDishModal(null);
    setDishInput('');
    await registerForTask(dishModal.taskId, dishModal.date, dish);
  };

  const registerForTask = async (taskId: string, date: Date, dish: string | null) => {
    if (!currentUser) return;
    const task = familyTasks.find(t => t.id === taskId);

    // Determine slot for recurring
    let taskSlot: string | null = null;
    if (task?.isRecurring) {
      const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      const dayName = dayNames[date.getDay()];
      const schedules = task.schedules || [task.slot];
      taskSlot = schedules.find(s => s.startsWith(dayName)) || `${dayName} · Matin`;
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
      const updated = {
        ...prev,
        [key]: {
          date: dateStr,
          userIds: [...existingUserIds, currentUser],
          dishes: { ...(existing?.dishes || {}), ...(dish ? { [currentUser]: dish } : {}) },
          recurringUsers: task?.isRecurring
            ? [...(existing?.recurringUsers || []), currentUser]
            : (existing?.recurringUsers || []),
        }
      };

      // If recurring, expand to future weeks in local state
      if (task?.isRecurring) {
        for (let w = 1; w <= 8; w++) {
          const futureDate = new Date(date);
          futureDate.setDate(futureDate.getDate() + (w * 7));
          const fy = futureDate.getFullYear();
          const fm = String(futureDate.getMonth() + 1).padStart(2, '0');
          const fd = String(futureDate.getDate()).padStart(2, '0');
          const futureDateStr = `${fy}-${fm}-${fd}`;
          const futureKey = `${taskId}_${futureDateStr}`;
          const futureExisting = updated[futureKey];
          const futureUserIds = futureExisting?.userIds || [];
          if (!futureUserIds.includes(currentUser)) {
            updated[futureKey] = {
              date: futureDateStr,
              userIds: [...futureUserIds, currentUser],
              dishes: { ...(futureExisting?.dishes || {}), ...(dish ? { [currentUser]: dish } : {}) },
              recurringUsers: [...(futureExisting?.recurringUsers || []), currentUser],
            };
          }
        }
      }

      return updated;
    });

    // Save to database
    try {
      await fetch('/api/task-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          userId: currentUser,
          date: dateStr,
          ...(dish ? { dish } : {}),
          ...(task?.isRecurring ? { recurring: true, slot: taskSlot } : {}),
        }),
      });
    } catch (error) {
      console.error('Failed to save registration', error);
    }
  };

  const unclaimTask = async (taskId: string, date: Date) => {
    if (!currentUser) return;
    const task = familyTasks.find(t => t.id === taskId);
    const isRecurringReg = task?.isRecurring && taskAssignments[getTaskAssignmentKey(taskId, date)]?.recurringUsers?.includes(currentUser);
    const key = getTaskAssignmentKey(taskId, date);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Update local state - remove current user from list
    setTaskAssignments(prev => {
      const updated = { ...prev };
      const existing = updated[key];
      const existingUserIds = existing?.userIds || [];
      const newUserIds = existingUserIds.filter(id => id !== currentUser);
      const newDishes = { ...(existing?.dishes || {}) };
      delete newDishes[currentUser];
      const newRecurringUsers = (existing?.recurringUsers || []).filter(id => id !== currentUser);
      updated[key] = { date: dateStr, userIds: newUserIds, dishes: newDishes, recurringUsers: newRecurringUsers };

      // If recurring, remove from all future weeks too
      if (isRecurringReg) {
        for (let w = 1; w <= 8; w++) {
          const futureDate = new Date(date);
          futureDate.setDate(futureDate.getDate() + (w * 7));
          const fy = futureDate.getFullYear();
          const fm = String(futureDate.getMonth() + 1).padStart(2, '0');
          const fd = String(futureDate.getDate()).padStart(2, '0');
          const futureDateStr = `${fy}-${fm}-${fd}`;
          const futureKey = `${taskId}_${futureDateStr}`;
          const futureExisting = updated[futureKey];
          if (futureExisting) {
            const futureDishes = { ...(futureExisting.dishes || {}) };
            delete futureDishes[currentUser];
            updated[futureKey] = {
              date: futureDateStr,
              userIds: futureExisting.userIds.filter(id => id !== currentUser),
              dishes: futureDishes,
              recurringUsers: (futureExisting.recurringUsers || []).filter(id => id !== currentUser),
            };
          }
        }
      }

      return updated;
    });

    // Delete from database
    try {
      const params = new URLSearchParams({ taskId, userId: currentUser });
      if (isRecurringReg) {
        params.set('recurring', 'true');
      } else {
        params.set('date', dateStr);
      }
      await fetch(`/api/task-registrations?${params.toString()}`, {
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

  // Détection des tâches libres pour demain
  const getFreeTasksTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const tasksForTomorrow = getTasksForDay(tomorrow);
    return tasksForTomorrow.filter(task => {
      const assignment = getTaskAssignment(task.id, tomorrow);
      return !assignment || assignment.userIds.length === 0;
    });
  };

  // Détection des tâches non auto-évaluées
  const getUnevaluatedTasks = () => {
    if (!currentUser) return [];
    return familyTasks.filter(task => {
      return !taskEvaluations.find(e => e.taskId === task.id && e.userId === currentUser);
    });
  };

  // Sauvegarder une évaluation
  const saveEvaluation = async (taskId: string, duration: number, penibility: number) => {
    if (!currentUser) {
      setToastMessage({ type: 'error', text: t.planner.mustBeLoggedEval });
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
      
      setToastMessage({ type: 'success', text: t.planner.evaluationSaved });
    } catch (error: any) {
      console.error('Failed to save evaluation', error);
      setToastMessage({ type: 'error', text: `${t.common.error}: ${error.message || t.planner.evalSaveFailed}` });
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
    return user?.name || t.planner.unknownUser;
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
          const validation = validatedTasks.find(v => v.taskId === task.id && v.date === todayStr && v.userId === currentUser);
          // Skip if already delegated (handled via getMyDelegatedTasks)
          if (validation?.delegatedTo !== undefined) return;
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
          const validation = validatedTasks.find(v => v.taskId === task.id && v.date === checkDateStr && v.userId === currentUser);
          // Skip if already delegated (handled via getMyDelegatedTasks)
          if (validation?.delegatedTo !== undefined) return;
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
        await fetch(`/api/task-validations?taskId=${taskId}&date=${dateStr}&userId=${currentUser}`, {
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
          newState = newState.map((v, i) => i === theirExisting ? { ...v, delegatedFrom: currentUser!, validated: false } : v);
        } else {
          newState = [...newState, delegatedValidation];
        }
      }

      return newState;
    });

    setDelegationMenu(null);

    // Persist to API
    // 1. Save current user's validation (not done, delegated)
    fetch('/api/task-validations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId,
        userId: currentUser,
        date: dateStr,
        validated: false,
        delegatedTo: delegatedToUserId,
      }),
    }).catch(() => {});

    // 2. If delegated to someone, create their pending validation
    if (delegatedToUserId) {
      fetch('/api/task-validations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          userId: delegatedToUserId,
          date: dateStr,
          validated: false,
          delegatedFrom: currentUser,
        }),
      }).catch(() => {});
    }
  };

  // Undo a delegation: put task back in "Tâches à valider" for current user
  const undelegateTask = (taskId: string, date: Date) => {
    if (!currentUser) return;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Find the current user's delegation record to get delegatedTo
    const myRecord = validatedTasks.find(v => v.taskId === taskId && v.date === dateStr && v.userId === currentUser && v.delegatedTo !== undefined);
    const delegatedToUserId = myRecord?.delegatedTo;

    setValidatedTasks(prev => {
      let newState = prev;
      // Remove delegatedTo from current user's record (back to pending)
      newState = newState.map(v => {
        if (v.taskId === taskId && v.date === dateStr && v.userId === currentUser) {
          const { delegatedTo, ...rest } = v;
          return { ...rest, validated: false, validatedAt: undefined };
        }
        return v;
      });
      // Remove the delegated user's record
      if (delegatedToUserId) {
        newState = newState.filter(v => !(v.taskId === taskId && v.date === dateStr && v.userId === delegatedToUserId && v.delegatedFrom));
      }
      return newState;
    });

    // Persist: delete current user's delegation record, re-create as simple pending
    fetch(`/api/task-validations?taskId=${taskId}&date=${dateStr}&userId=${currentUser}`, {
      method: 'DELETE',
    }).catch(() => {});

    // Delete the delegated user's record
    if (delegatedToUserId) {
      fetch(`/api/task-validations?taskId=${taskId}&date=${dateStr}&userId=${delegatedToUserId}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
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
          delegatorName: delegator?.name || t.planner.someone
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

  // Get tasks delegated to me that I accepted (for history)
  const getAcceptedDelegationsToMe = () => {
    if (!currentUser) return [];
    return validatedTasks
      .filter(v => v.userId === currentUser && v.delegatedFrom && v.validated)
      .map(v => {
        const task = tasks.find(t => t.id === v.taskId);
        if (!task) return null;
        const delegator = users.find(m => m.id === v.delegatedFrom);
        return {
          task,
          date: new Date(v.date),
          validation: v,
          delegatorName: delegator?.name || t.planner.someone,
          points: calculateTaskPoints(task)
        };
      })
      .filter(Boolean) as { task: Task; date: Date; validation: ValidatedTask; delegatorName: string; points: number }[];
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

  // Classement filtré par période et métrique
  const getFilteredUserStats = (userId: string) => {
    let startDate: Date | null = null;
    if (rankingPeriod === 'week') {
      startDate = getWeekStart(new Date());
    } else if (rankingPeriod === 'month') {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const isInPeriod = (dateStr: string) => {
      if (!startDate) return true;
      const [y, m, d] = dateStr.split('-').map(Number);
      const taskDate = new Date(y, m - 1, d);
      return taskDate >= startDate;
    };

    const filteredValidated = validatedTasks.filter(v =>
      v.userId === userId && v.validated && isInPeriod(v.date)
    );
    const filteredExceptional = exceptionalTasks.filter(t =>
      t.userId === userId && t.validated && isInPeriod(t.date)
    );

    const points = filteredValidated.reduce((sum, v) => {
      const task = familyTasks.find(t => t.id === v.taskId);
      return sum + (task ? calculateTaskPoints(task) : 0);
    }, 0) + filteredExceptional.reduce((sum, t) => sum + calculateExceptionalPoints(t), 0);

    const taskCount = filteredValidated.length + filteredExceptional.length;

    const time = filteredValidated.reduce((sum, v) => {
      const task = familyTasks.find(t => t.id === v.taskId);
      if (!task) return sum;
      const evals = taskEvaluations.filter(e => e.taskId === task.id);
      if (evals.length > 0) {
        const durations = evals.map(e => e.duration).sort((a, b) => a - b);
        const median = durations.length % 2 === 0
          ? (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2
          : durations[Math.floor(durations.length / 2)];
        return sum + median;
      }
      return sum + task.duration;
    }, 0) + filteredExceptional.reduce((sum, t) => sum + t.duration, 0);

    return { points, taskCount, time };
  };

  const getFilteredLeaderboard = () => {
    return familyUsers
      .filter(user => user.participatesInLeaderboard !== false)
      .map(user => {
        const stats = getFilteredUserStats(user.id);
        return {
          ...user,
          value: rankingMetric === 'points' ? stats.points
               : rankingMetric === 'tasks' ? stats.taskCount
               : stats.time,
          totalPoints: stats.points,
          taskCount: stats.taskCount,
          time: stats.time,
        };
      })
      .sort((a, b) => b.value - a.value);
  };

  const getFilteredMaxValue = () => {
    const lb = getFilteredLeaderboard();
    if (lb.length === 0) return 100;
    return Math.max(lb[0].value, 1);
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
  };

  const formatMetricValue = (value: number) => {
    if (rankingMetric === 'points') return `${value} ${t.common.pts}`;
    if (rankingMetric === 'tasks') return `${value} ${t.common.tasks}`;
    return formatDuration(value);
  };

  const formatMetricSubtext = (user: { taskCount: number; time: number; totalPoints: number }) => {
    if (rankingMetric === 'points') return `${user.taskCount} ${t.common.tasks}`;
    if (rankingMetric === 'tasks') return `${user.totalPoints} ${t.common.pts}`;
    return `${user.taskCount} ${t.common.tasks}`;
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
    // Si la dette de points est désactivée pour cette famille, pas de report
    const currentFamilyData = families.find(f => f.id === selectedFamily);
    if (currentFamilyData && !currentFamilyData.pointDebtEnabled) return 0;

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
          setParamMessage(t.planner.familyDeleted);
        } else {
          setParamMessage(t.planner.deletionError);
        }
      } catch (error) {
        console.error("Failed to delete family", error);
        setParamMessage(t.planner.deletionError);
      }
    };
    
    deleteFamilyInDB();
  }

  useEffect(() => {
    const authParam = searchParams?.get("auth");
    if (authParam === "signup") setAuthView("signup");
    if (authParam === "login") setAuthView("login");

    // Handle Google OAuth callback
    const googleAuth = searchParams?.get("googleAuth");
    if (googleAuth) {
      try {
        const user = JSON.parse(decodeURIComponent(googleAuth));
        mergeAuthUser(user);
        setCurrentUser(user.id);
        setSelectedUser(user.id);
        setSelectedFamily(user.familyIds?.[0] ?? selectedFamily);
        setAuthError("");
        setAuthMessage(`${t.planner.loggedInAs} ${user.name}.`);
        window.localStorage.setItem("sessionUser", JSON.stringify(user));
        window.history.replaceState({}, "", "/planner");

        // Apply preferences from DB (or lazy-migrate localStorage prefs)
        const dbPrefs = user.preferences;
        if (dbPrefs && Object.keys(dbPrefs).length > 0) {
          const resolved = resolvePreferences(dbPrefs);
          writePreferencesToLocalStorage(resolved);
          dispatchPreferencesUpdated(resolved);
        } else {
          const local = readPreferencesFromLocalStorage();
          savePreferencesToDB(user.id, local);
        }
      } catch (e) {
        console.error("google auth parse", e);
        setAuthError(t.planner.googleError);
      }
    }

    // Handle Google OAuth errors
    const errorParam = searchParams?.get("error");
    if (errorParam?.startsWith("google_")) {
      const messages: Record<string, string> = {
        google_denied: t.planner.googleCancelled,
        google_token: t.planner.googleError,
        google_email: t.planner.cannotGetGoogleEmail,
        google_server: t.planner.googleError,
      };
      setAuthError(messages[errorParam] || t.planner.googleError);
    }
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
          const mappedFamilies = familiesData.map((f: any) => ({ id: f.id, name: f.name, code: f.code || "", pointDebtEnabled: f.pointDebtEnabled ?? true }));
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
              isCooking: t.isCooking || false,
              isRecurring: t.isRecurring || false,
            }));
            setTasks(mappedTasks);
            
            // Load task registrations (inscriptions)
            for (const family of familiesData) {
              const registrationsRes = await fetch(`/api/task-registrations?familyId=${family.id}`);
              if (registrationsRes.ok) {
                const registrationsData = await registrationsRes.json();
                const newAssignments: Record<string, { date: string; userIds: string[]; dishes?: Record<string, string>; recurringUsers?: string[] }> = {};

                // Helper to add a user to a key
                const addToKey = (key: string, dateStr: string, userId: string, dish?: string | null, isRecurring?: boolean) => {
                  if (!newAssignments[key]) {
                    newAssignments[key] = { date: dateStr, userIds: [] };
                  }
                  if (userId && !newAssignments[key].userIds.includes(userId)) {
                    newAssignments[key].userIds.push(userId);
                  }
                  if (dish) {
                    if (!newAssignments[key].dishes) newAssignments[key].dishes = {};
                    newAssignments[key].dishes![userId] = dish;
                  }
                  if (isRecurring) {
                    if (!newAssignments[key].recurringUsers) newAssignments[key].recurringUsers = [];
                    if (!newAssignments[key].recurringUsers!.includes(userId)) {
                      newAssignments[key].recurringUsers!.push(userId);
                    }
                  }
                };

                for (const reg of registrationsData) {
                  const key = `${reg.taskId}_${reg.date}`;
                  addToKey(key, reg.date, reg.userId, reg.dish, reg.recurring);

                  // If recurring, expand to future weeks (next 8 weeks)
                  if (reg.recurring && reg.slot) {
                    const slotDay = reg.slot.split(' · ')[0]; // e.g. "Lun"
                    const dayMap: Record<string, number> = { 'Lun': 1, 'Mar': 2, 'Mer': 3, 'Jeu': 4, 'Ven': 5, 'Sam': 6, 'Dim': 0 };
                    const targetDayOfWeek = dayMap[slotDay];
                    if (targetDayOfWeek !== undefined) {
                      const regDate = new Date(reg.date + 'T00:00:00');
                      for (let w = 1; w <= 8; w++) {
                        const futureDate = new Date(regDate);
                        futureDate.setDate(futureDate.getDate() + (w * 7));
                        const y = futureDate.getFullYear();
                        const m = String(futureDate.getMonth() + 1).padStart(2, '0');
                        const d = String(futureDate.getDate()).padStart(2, '0');
                        const futureDateStr = `${y}-${m}-${d}`;
                        const futureKey = `${reg.taskId}_${futureDateStr}`;
                        addToKey(futureKey, futureDateStr, reg.userId, reg.dish, true);
                      }
                    }
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
                  validatedAt: v.createdAt || v.validatedAt,
                  delegatedTo: v.delegatedTo ?? undefined,
                  delegatedFrom: v.delegatedFrom ?? undefined,
                }));
                setValidatedTasks(prev => {
                  // Merge without duplicates (key: taskId-date-userId)
                  const existing = new Set(prev.map(v => `${v.taskId}-${v.date}-${v.userId}`));
                  const newOnes = loadedValidations.filter(v => !existing.has(`${v.taskId}-${v.date}-${v.userId}`));
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

  // Load calendar data when family or month changes
  useEffect(() => {
    if (selectedFamily) {
      loadCalendarData();
    }
  }, [selectedFamily, currentDate.getMonth(), currentDate.getFullYear()]);

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
      setParamMessage(t.planner.familyNameRequired);
      return;
    }
    if (!currentUser) {
      setParamMessage(t.planner.mustBeLoggedFamily);
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
          setParamMessage(t.planner.familyCreatedWithCode + newFamily.code);
        } else {
          const errData = await res.json();
          setParamMessage(t.common.error + ": " + (errData.error || t.planner.familyCreationFailed));
        }
      } catch (error) {
        console.error("Failed to create family", error);
        setParamMessage(t.planner.familyCreationError);
      }
    };
    
    createFamilyInDB();
  }

  function addUser() {
    setAddUserMessage("");
    if (!newUserEmail.trim()) {
      setAddUserMessage(t.planner.emailRequired);
      return;
    }
    const email = newUserEmail.trim().toLowerCase();
    const first = newUserFirst.trim();
    const last = newUserLast.trim();
    const fullName = makeFullName(first, last, "");

    let found = false;
    const user = users.find((u) => (u.email ?? "").toLowerCase() === email);
    
    if (!user) {
      setAddUserMessage(t.planner.userNotFound);
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
          setAddUserMessage(t.planner.memberAdded);
          setNewUserFirst("");
          setNewUserLast("");
          setNewUserEmail("");
        }
      } catch (error) {
        console.error("Failed to add user to family", error);
        setAddUserMessage(t.planner.addMemberError);
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

      // Fetch preferences from DB for cross-device sync
      fetch(`/api/users/${parsed.id}/preferences`)
        .then((r) => r.json())
        .then((data) => {
          if (data.preferences && Object.keys(data.preferences).length > 0) {
            const resolved = resolvePreferences(data.preferences);
            writePreferencesToLocalStorage(resolved);
            dispatchPreferencesUpdated(resolved);
          } else {
            // Lazy migration: upload current localStorage prefs to DB
            const local = readPreferencesFromLocalStorage();
            savePreferencesToDB(parsed.id, local);
          }
        })
        .catch(() => { /* ignore fetch errors on restore */ });
    } catch (e) {
      console.warn("session parse", e);
      window.localStorage.removeItem("sessionUser");
    }
  }, []);

  async function createAccount() {
    if (!newAccount.name.trim() || !newAccount.email.trim() || !newAccount.password.trim()) {
      setAuthError(t.planner.nameEmailPasswordRequired);
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
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAuthError(data?.error || t.planner.signupError);
        setAuthMessage("");
        return;
      }

      const { user } = data;
      mergeAuthUser(user);
      setCurrentUser(user.id);
      setSelectedUser(user.id);
      setNewAccount({ name: "", email: "", password: "", familyId: selectedFamily });
      setAuthView("login");
      setAuthMessage(t.planner.accountCreated);
      setAuthError("");
      window.localStorage.setItem("sessionUser", JSON.stringify(user));

      // New account: upload current localStorage prefs to DB
      const local = readPreferencesFromLocalStorage();
      savePreferencesToDB(user.id, local);
    } catch (error) {
      console.error("signup", error);
      setAuthError(t.planner.networkError);
    }
  }

  async function login(emailArg?: string, passwordArg?: string) {
    const email = (emailArg ?? authEmail).trim().toLowerCase();
    const pwd = (passwordArg ?? authPassword).trim();
    if (!email || !pwd) {
      setAuthError(t.planner.emailPasswordRequired);
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
        setAuthError(data?.error || t.planner.loginFailed);
        setAuthMessage("");
        return;
      }
      const { user } = data;
      mergeAuthUser(user);
      setCurrentUser(user.id);
      setSelectedUser(user.id);
      setSelectedFamily(user.familyIds?.[0] ?? selectedFamily);
      setAuthError("");
      setAuthMessage(`${t.planner.loggedInAs} ${user.name}.`);
      window.localStorage.setItem("sessionUser", JSON.stringify(user));

      // Apply preferences from DB (or lazy-migrate localStorage prefs)
      const dbPrefs = user.preferences;
      if (dbPrefs && Object.keys(dbPrefs).length > 0) {
        const resolved = resolvePreferences(dbPrefs);
        writePreferencesToLocalStorage(resolved);
        dispatchPreferencesUpdated(resolved);
      } else {
        const local = readPreferencesFromLocalStorage();
        savePreferencesToDB(user.id, local);
      }
    } catch (error) {
      console.error("login", error);
      setAuthError(t.planner.networkError);
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

  async function forgotPassword() {
    if (!forgotEmail.trim()) {
      setAuthError(t.planner.emailRequired);
      return;
    }
    setForgotLoading(true);
    setAuthError("");
    setAuthMessage("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data?.error || t.planner.sendError);
      } else {
        setAuthMessage(t.planner.resetEmailSent);
        setForgotEmail("");
      }
    } catch {
      setAuthError(t.planner.networkError);
    } finally {
      setForgotLoading(false);
    }
  }

  function joinFamily(userId: string, familyId: string) {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, familyId } : u)));
  }

  function joinFamilyByName() {
    setParamMessage("");
    if (!joinFamilyName.trim()) {
      setParamMessage(t.planner.familyNameRequired);
      return;
    }
    const found = families.find((f) => f.name.toLowerCase() === joinFamilyName.trim().toLowerCase());
    if (!found) {
      setParamMessage(t.planner.familyNotFound);
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
      setParamMessage(t.planner.connectedNotLogged);
      setJoinFamilyName("");
    }
  }

  function joinFamilyByCode() {
    setParamMessage("");
    if (!joinFamilyCode.trim()) {
      setParamMessage(t.planner.familyCodeRequired);
      return;
    }
    
    if (!currentUser) {
      setParamMessage(t.planner.mustBeLogged);
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
          setParamMessage(t.planner.familyJoined);
        } else {
          const data = await res.json();
          setParamMessage(data.error || "Erreur lors de la connexion");
        }
      } catch (error) {
        console.error("Failed to join family by code", error);
        setParamMessage(t.planner.joinError);
      }
    };
    joinFamilyInDB();
  }

  function leaveFamily() {
    setParamMessage("");
    if (!currentUser || !currentFamily) {
      setParamMessage(t.planner.selectFamilyToLeave);
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
          setParamMessage(t.planner.leftFamily);
        } else {
          setParamMessage(t.planner.deletionError);
        }
      } catch (error) {
        console.error("Failed to leave family", error);
        setParamMessage(t.planner.deletionError);
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
      setParamMessage(t.planner.createOrJoinFamily);
      return;
    }
    if (!newTask.title.trim()) {
      setParamMessage(t.planner.taskTitleRequired);
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
            isCooking: newTaskIsCooking,
            isRecurring: newTaskIsRecurring,
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
            isCooking: createdTask.isCooking || false,
            isRecurring: createdTask.isRecurring || false,
          }]);
          setNewTask({ title: "", duration: 30, penibility: 30 });
          setNewTaskDay(dayOptions[0]);
          setNewTaskTime("08:00");
          setNewTaskSchedules([]);
          setNewTaskIsCooking(false);
          setNewTaskIsRecurring(false);
        } else {
          const errData = await res.json();
          alert(t.common.error + ": " + (errData.error || t.planner.familyCreationFailed));
        }
      } catch (error) {
        console.error("Failed to create task", error);
        alert(t.planner.taskCreationError);
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
          alert(t.common.error + ": " + (errData.error || t.planner.deletionError));
        }
      } catch (error) {
        console.error("Failed to delete task", error);
        alert(t.planner.deletionError);
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
      setParamMessage(t.planner.selectMember);
      return;
    }
    if (!editUserDraft.firstName.trim() || !editUserDraft.lastName.trim()) {
      setParamMessage(t.planner.firstLastRequired);
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
          setParamMessage(t.planner.memberUpdated);
          setEditUserId("");
        } else {
          setParamMessage(t.planner.saveError);
        }
      } catch (error) {
        console.error("Failed to update user", error);
        setParamMessage(t.planner.updateError);
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
      setToastMessage({ type: 'error', text: t.planner.mustBeLogged });
      return;
    }
    
    if (familyUsers.length === 0) {
      setToastMessage({ type: 'error', text: t.planner.noMembersForAutoAssign });
      return;
    }

    // Filtrer les membres qui participent à l'auto-attribution
    const autoAssignUsers = familyUsers.filter(u => u.participatesInAutoAssign !== false);
    if (autoAssignUsers.length === 0) {
      setToastMessage({ type: 'error', text: t.planner.noParticipantsAutoAssign });
      return;
    }
    
    if (familyTasks.length === 0) {
      setToastMessage({ type: 'error', text: t.planner.noTasksConfigured });
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
    
    // ===== SOLVEUR MILP D'AUTO-ATTRIBUTION =====
    // Optimisation globale via programmation linéaire en nombres entiers

    const normalizedCosts = calculateNormalizedCosts();

    // Calculer le total des points pour la semaine
    let totalWeeklyPoints = 0;
    let totalAllTasksPoints = 0;
    const registeredPointsByUser = new Map<string, number>();
    const allUnassignedTasks: { task: Task; date: Date; dateStr: string; key: string; timeSlot: string }[] = [];

    // Plage lundi-dimanche : si dimanche, commence demain (lundi) jusqu'au dimanche suivant
    const todayDow = new Date().getDay(); // 0=Dim, 1=Lun... 6=Sam
    const startOffset = todayDow === 0 ? 1 : 0;
    const endOffset = todayDow === 0 ? 7 : (7 - todayDow);

    // Jours passés (lundi → hier) : compter les points inscrits + total
    const mondayOffset = todayDow === 0 ? 1 : -(todayDow - 1);
    for (let dayOffset = mondayOffset; dayOffset < startOffset; dayOffset++) {
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
        const pts = calculateTaskPoints(task);

        if (existing && existing.userIds.length > 0) {
          // Ne compter que les tâches effectivement faites dans le total
          totalAllTasksPoints += pts;
          for (const uid of existing.userIds) {
            registeredPointsByUser.set(uid, (registeredPointsByUser.get(uid) || 0) + pts);
          }
        }
      });
    }

    // Jours restants (aujourd'hui → dimanche) : tâches non assignées + points inscrits
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
        const pts = calculateTaskPoints(task);
        totalAllTasksPoints += pts;

        if (isUnassigned) {
          totalWeeklyPoints += pts;
          allUnassignedTasks.push({
            task,
            date,
            dateStr,
            key,
            timeSlot: getTaskTimeSlot(task, date)
          });
        } else if (existing) {
          // Comptabiliser les points déjà inscrits par utilisateur
          for (const uid of existing.userIds) {
            registeredPointsByUser.set(uid, (registeredPointsByUser.get(uid) || 0) + pts);
          }
        }
      });
    }

    if (allUnassignedTasks.length === 0) {
      setToastMessage({ type: 'error', text: t.planner.allTasksAssignedUntilSunday });
      return;
    }

    // Cible dynamique par utilisateur (pondérée par présence)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const presenceWeights = new Map<string, number>();
    let totalWeight = 0;
    autoAssignUsers.forEach(u => {
      const absenceDays = getUserAbsenceDaysForWeek(u.id, today);
      const weight = Math.max(0.1, (7 - absenceDays) / 7);
      presenceWeights.set(u.id, weight);
      totalWeight += weight;
    });
    const getTargetForUser = (userId: string): number => {
      const weight = presenceWeights.get(userId) || 1;
      const fairShare = totalAllTasksPoints * (weight / totalWeight);
      const alreadyRegistered = registeredPointsByUser.get(userId) || 0;
      return Math.max(0, fairShare - alreadyRegistered);
    };

    // Historique de rotation (4 dernières semaines)
    const rotationHistory = getRotationHistory();

    // Construire la matrice d'éligibilité (taskKey → userIds éligibles)
    const eligibility = new Map<string, string[]>();
    for (const { key, timeSlot, date } of allUnassignedTasks) {
      const eligible = autoAssignUsers
        .filter(u => {
          if (u.unavailable.includes(timeSlot)) return false;
          if (isUserBusyAtTime(u.id, date, timeSlot)) return false;
          return true;
        })
        .map(u => u.id);
      eligibility.set(key, eligible);
    }

    // Préparer les données pour le solveur
    const solverTasks: SolverTaskDay[] = allUnassignedTasks.map(({ task, dateStr, key, timeSlot }) => ({
      taskId: task.id,
      taskTitle: task.title,
      date: dateStr,
      key,
      points: calculateTaskPoints(task),
      timeSlot,
    }));

    const solverMembers: SolverMember[] = autoAssignUsers.map(u => ({
      userId: u.id,
      userName: u.name,
      target: getTargetForUser(u.id),
      unavailableSlots: u.unavailable,
    }));

    const solverCosts: SolverCostEntry[] = normalizedCosts.map(c => ({
      userId: c.userId,
      taskId: c.taskId,
      cost: c.cost,
    }));

    const solverRotations: SolverRotationEntry[] = [];
    for (const [userId, taskMap] of rotationHistory.entries()) {
      for (const [taskId, count] of taskMap.entries()) {
        solverRotations.push({ userId, taskId, count });
      }
    }

    // Historique de déséquilibre (semaine précédente)
    const lastWeekBalances = autoAssignUsers.map(u => ({
      userId: u.id,
      balance: getLastWeekBalance(u.id),
    }));

    const currentFamilyData = families.find(f => f.id === selectedFamily);
    const pointDebtEnabled = currentFamilyData?.pointDebtEnabled ?? true;

    const solverResult = solveMILP(
      {
        tasks: solverTasks,
        members: solverMembers,
        costs: solverCosts,
        rotations: solverRotations,
        weeklyHistory: lastWeekBalances,
        params: {
          alpha: 4.0,
          beta: 0.4,
          lambdaHistory: pointDebtEnabled ? 0.25 : 0,
          preferenceBonus: 0.7,
          preferenceThreshold: 0.2,
        },
      },
      eligibility
    );

    if (!solverResult.feasible) {
      setToastMessage({ type: 'error', text: t.planner.solverNoSolution });
      return;
    }

    const newAssignments = solverResult.assignments;

    if (newAssignments.length === 0) {
      setToastMessage({ type: 'error', text: t.planner.allMembersUnavailable });
      return;
    }

    // Calculer la répartition finale pour le message
    const finalDistribution = new Map<string, number>();
    autoAssignUsers.forEach(u => finalDistribution.set(u.id, 0));
    newAssignments.forEach(a => {
      finalDistribution.set(a.userId, (finalDistribution.get(a.userId) ?? 0) + a.points);
    });

    // Sauvegarder les attributions
    const saveAssignments = () => {
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
          const dayLabel = new Date(a.date + 'T00:00:00').toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
          summary.tasks.push({ title: a.taskTitle, day: dayLabel, points: a.points, reason: a.reason });
          summary.points += a.points;
        }
      }

      const details: string[] = [];
      userSummaries.forEach((summary, userId) => {
        if (summary.tasks.length > 0 || (registeredPointsByUser.get(userId) || 0) > 0) {
          const weight = presenceWeights.get(userId) || 1;
          const fairShare = Math.round(totalAllTasksPoints * (weight / totalWeight));
          const alreadyRegistered = Math.round(registeredPointsByUser.get(userId) || 0);
          const target = Math.max(0, fairShare - alreadyRegistered);
          details.push(`── ${summary.name} — ${Math.round(summary.points)} ${t.common.pts} ──`);
          details.push(`  ${fairShare} ${t.common.pts} / ${Math.round(totalAllTasksPoints)} ${t.common.pts}`);
          if (alreadyRegistered > 0) {
            details.push(`  -${alreadyRegistered} ${t.common.pts}`);
          }
          details.push(`  ${Math.round(target)} ${t.common.pts}`);
          summary.tasks.forEach(t => {
            details.push(`  • ${t.title} (${t.day}, ${Math.round(t.points)} pts)`);
            details.push(`    ${t.reason}`);
          });
        }
      });

      // Afficher le toast immédiatement
      setToastMessage({
        type: 'success',
        text: `${newAssignments.length} ${t.common.tasks} (${Math.round(totalWeeklyPoints)} ${t.common.pts})`,
        details
      });

      // Sauvegarder en arrière-plan (sans bloquer l'UI)
      for (const assignment of newAssignments) {
        fetch('/api/task-registrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: assignment.taskId,
            userId: assignment.userId,
            date: assignment.date
          }),
        }).catch(() => {
          console.error('Registration failed:', assignment);
        });
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
        reason = t.planner.findsTaskEasy;
      } else if (winner.progressivePenalty < 0.1) {
        reason = t.planner.hasCapacity;
      } else if (winner.rotationCount === 0 && scored.some(s => s.rotationCount > 0)) {
        reason = t.planner.rotation;
      } else if (winner.personalCost < scored[scored.length - 1]?.personalCost - 0.2) {
        reason = t.planner.prefersTask;
      } else {
        reason = t.planner.loadBalancing;
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
          {/* Branding */}
          <div className={styles.authBranding}>
            <Image
              src="/logo/logo_sans_nom_couleur.png"
              alt="Fam'Planner"
              width={56}
              height={56}
            />
            <h1 className={styles.authTitle}>Fam&apos;Planner</h1>
            <p className={styles.authSubtitle}>
              {t.planner.organizeHousehold}
            </p>
          </div>

          {/* Google OAuth (hidden on forgot view) */}
          {authView !== "forgot" && (
            <>
              <button
                className={styles.googleBtn}
                onClick={() => { window.location.href = "/api/auth/google"; }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" style={{ flexShrink: 0 }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {t.planner.continueWithGoogle}
              </button>

              <div className={styles.authDivider}>
                <span>{t.common.or}</span>
              </div>
            </>
          )}

          {/* Tabs (hidden on forgot view) */}
          {authView !== "forgot" && (
            <div className={styles.authTabs}>
              <button
                className={authView === "login" ? styles.tabActive : styles.tab}
                onClick={() => {
                  setAuthView("login");
                  setAuthMessage("");
                  setAuthError("");
                }}
              >
                {t.planner.login}
              </button>
              <button
                className={authView === "signup" ? styles.tabActive : styles.tab}
                onClick={() => {
                  setAuthView("signup");
                  setAuthMessage("");
                  setAuthError("");
                }}
              >
                {t.planner.signup}
              </button>
            </div>
          )}

          {/* Forgot password header */}
          {authView === "forgot" && (
            <h2 className={styles.authSectionTitle}>{t.planner.resetPasswordTitle}</h2>
          )}

          {/* Login form */}
          {authView === "login" && (
            <div className={styles.authForm}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>{t.planner.email}</label>
                <input
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder={t.planner.emailPlaceholder}
                  type="email"
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>{t.planner.password}</label>
                <div className={styles.passwordField}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder={t.planner.passwordPlaceholder}
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    <Icon name={showPassword ? "eyeSlash" : "eye"} size={16} />
                  </button>
                </div>
              </div>
              <button className={styles.authSubmitBtn} onClick={() => login()}>
                {t.planner.loginBtn}
              </button>
              <button
                type="button"
                className={styles.forgotLink}
                onClick={() => {
                  setAuthView("forgot");
                  setAuthError("");
                  setAuthMessage("");
                }}
              >
                {t.planner.forgotPassword}
              </button>
            </div>
          )}

          {/* Signup form */}
          {authView === "signup" && (
            <div className={styles.authForm}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>{t.planner.name}</label>
                <input
                  value={newAccount.name}
                  onChange={(e) => setNewAccount((a) => ({ ...a, name: e.target.value }))}
                  placeholder={t.planner.namePlaceholder}
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>{t.planner.email}</label>
                <input
                  value={newAccount.email}
                  onChange={(e) => setNewAccount((a) => ({ ...a, email: e.target.value }))}
                  placeholder={t.planner.emailPlaceholder}
                  type="email"
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>{t.planner.password}</label>
                <div className={styles.passwordField}>
                  <input
                    type={showSignupPassword ? "text" : "password"}
                    value={newAccount.password}
                    onChange={(e) => setNewAccount((a) => ({ ...a, password: e.target.value }))}
                    placeholder={t.planner.passwordPlaceholder}
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    tabIndex={-1}
                  >
                    <Icon name={showSignupPassword ? "eyeSlash" : "eye"} size={16} />
                  </button>
                </div>
              </div>
              <button className={styles.authSubmitBtn} onClick={createAccount}>
                {t.planner.createAccount}
              </button>
            </div>
          )}

          {/* Forgot password form */}
          {authView === "forgot" && (
            <div className={styles.authForm}>
              <p className={styles.forgotDescription}>
                {t.planner.resetEmailDesc}
              </p>
              <div className={styles.inputGroup}>
                <label className={styles.label}>{t.planner.email}</label>
                <input
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder={t.planner.emailPlaceholder}
                  type="email"
                />
              </div>
              <button
                className={styles.authSubmitBtn}
                onClick={forgotPassword}
                disabled={forgotLoading}
              >
                {forgotLoading ? t.planner.sending : t.planner.sendLink}
              </button>
              <button
                type="button"
                className={styles.backLink}
                onClick={() => {
                  setAuthView("login");
                  setAuthError("");
                  setAuthMessage("");
                }}
              >
                <Icon name="arrowLeft" size={14} /> {t.planner.backToLogin}
              </button>
            </div>
          )}

          {/* Error / Success messages */}
          {authError && (
            <div className={styles.authAlert} data-type="error">
              <Icon name="alertTriangle" size={14} />
              {authError}
            </div>
          )}
          {authMessage && (
            <div className={styles.authAlert} data-type="success">
              <Icon name="circleCheck" size={14} />
              {authMessage}
            </div>
          )}
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
              <h3><Icon name="user" size={18} style={{ marginRight: '8px' }} />{t.tabs.mySpace}</h3>
              <div className={styles.myPointsTotal}>
                <span className={styles.pointsLabel}>{t.planner.myPoints}</span>
                <span className={styles.pointsValue}>{getMyTotalPoints()} pts</span>
              </div>
            </div>

            {!currentUser ? (
              <p className={styles.mutedSmall} style={{ color: "#ff6b6b", display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon name="warning" size={14} />{t.planner.connectToSee}
              </p>
            ) : (
              <>
                {/* Notification banners */}
                {showFreeTasksNotif && getFreeTasksTomorrow().length > 0 && (
                  <div className={styles.notifBanner}>
                    <div className={styles.notifBannerContent}>
                      <Icon name="info" size={16} />
                      <span>
                        <strong>{getFreeTasksTomorrow().length}</strong> {t.planner.freeTasksTomorrow}
                      </span>
                    </div>
                    <div className={styles.notifBannerActions}>
                      <button className={styles.notifBannerBtn} onClick={() => { setSelectedCalendarDay((() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0,0,0,0); return d; })()); setActiveTab('planificateur'); }}>
                        {t.planner.viewPlanner}
                      </button>
                      <button className={styles.notifBannerClose} onClick={() => setShowFreeTasksNotif(false)}>
                        <Icon name="xmark" size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {showEvalNotif && getUnevaluatedTasks().length > 0 && (
                  <div className={styles.notifBanner} data-type="eval">
                    <div className={styles.notifBannerContent}>
                      <Icon name="target" size={16} />
                      <span>
                        <strong>{getUnevaluatedTasks().length}</strong> {t.planner.unevaluatedTasks}
                      </span>
                    </div>
                    <div className={styles.notifBannerActions}>
                      <button className={styles.notifBannerBtn} onClick={() => setActiveTab('taches')}>
                        {t.planner.evaluate}
                      </button>
                      <button className={styles.notifBannerClose} onClick={() => setShowEvalNotif(false)}>
                        <Icon name="xmark" size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Prochaines tâches */}
                <div className={styles.monEspaceSection}>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="clipboardList" size={16} />{t.planner.myUpcomingTasks}</h4>
                  <div className={styles.tasksList}>
                    {getMyUpcomingTasks().length === 0 ? (
                      <p className={styles.noTasks}>{t.planner.noUpcomingTasks}</p>
                    ) : (
                      getMyUpcomingTasks().map((item, idx) => {
                        const upcomingAssignment = getTaskAssignment(item.task.id, item.date);
                        const myDish = item.task.isCooking && upcomingAssignment?.dishes?.[currentUser || ''];
                        return (
                        <div key={`${item.task.id}-${idx}`} className={styles.myTaskCard}>
                          <div className={styles.myTaskDate} style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '70px' }}>
                            <span style={{ fontWeight: 500 }}>
                              {item.date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{formatTimeDisplay(item.timeSlot)}</span>
                          </div>
                          <div className={styles.myTaskInfo}>
                            <strong>{item.task.title}{item.task.isRecurring && <span className={styles.recurringBadge} title={t.planner.recurring}> ↻</span>}</strong>
                            {myDish && <span className={styles.dishLabel}>{myDish}</span>}
                            <span className={styles.taskMeta}>{item.task.duration} {t.common.minutes} · {t.planner.penibilityShort} {item.task.penibility}%</span>
                          </div>
                          <span className={styles.taskPoints}>+{item.points} pts</span>
                        </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Tâches passées en attente de validation - toujours visibles */}
                {(getMyPastTasks().filter(t => !t.validated).length > 0 || getDelegatedToMeTasks().length > 0) && (
                  <div className={styles.monEspaceSection}>
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-warning)' }}>
                      <Icon name="clock" size={16} />{t.planner.tasksToValidate} ({getMyPastTasks().filter(t => !t.validated).length + getDelegatedToMeTasks().length})
                    </h4>
                    <div className={styles.pastTasksList}>
                      {/* Tâches déléguées par d'autres */}
                      {getDelegatedToMeTasks().map((item, idx) => (
                        <div key={`delegated-${item.task.id}-${idx}`} className={`${styles.myTaskCard} ${styles.pendingTask}`} style={{ borderLeftColor: 'var(--color-primary)', borderLeftWidth: '3px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '70px' }}>
                            <span style={{ fontWeight: 500 }}>
                              {item.date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
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
                              <Icon name="check" size={12} style={{ marginRight: '4px' }} />{t.planner.iDidIt}
                            </button>
                          </div>
                        </div>
                      ))}
                      
                      {/* Mes propres tâches à valider */}
                      {getMyPastTasks().filter(t => !t.validated).map((item, idx) => (
                        <div key={`pending-${item.task.id}-${idx}`} className={`${styles.myTaskCard} ${styles.pendingTask}`} style={{ position: 'relative' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '70px' }}>
                            <span style={{ fontWeight: 500 }}>
                              {item.date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{formatTimeDisplay(item.timeSlot)}</span>
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
                              <Icon name="check" size={12} style={{ marginRight: '4px' }} />{t.planner.iDidIt}
                            </button>
                            <button
                              className={styles.notDoneBtn}
                              onClick={() => setDelegationMenu({ taskId: item.task.id, date: item.date, timeSlot: item.timeSlot })}
                            >
                              <Icon name="xmark" size={12} style={{ marginRight: '4px' }} />{t.planner.notDone}
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
                              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '8px' }}>{t.planner.whoDidIt}</p>
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
                                  {t.planner.nobody}
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
                                  {t.common.cancel}
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
                {(getMyPastTasks().filter(t => t.validated).length > 0 || getMyDelegatedTasks().length > 0 || getAcceptedDelegationsToMe().length > 0) && (
                  <div className={styles.monEspaceSection}>
                    <button
                      className={styles.togglePastBtn}
                      onClick={() => setShowPastTasks(!showPastTasks)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Icon name={showPastTasks ? "chevronDown" : "chevronRight"} size={12} />{t.planner.history} ({getMyPastTasks().filter(t => t.validated).length + getMyDelegatedTasks().length + getAcceptedDelegationsToMe().length})
                    </button>
                    
                    {showPastTasks && (
                      <div className={styles.pastTasksList}>
                        {/* Tâches validées par moi */}
                        {getMyPastTasks().filter(t => t.validated).map((item, idx) => (
                          <div key={`validated-${item.task.id}-${idx}`} className={`${styles.myTaskCard} ${styles.validatedTask}`}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '70px' }}>
                              <span style={{ fontWeight: 500 }}>
                                {item.date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{formatTimeDisplay(item.timeSlot)}</span>
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
                                title={t.planner.cancelValidation}
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
                                {item.date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
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
                                {item.delegatedToName ? `${t.planner.doneBy} ${item.delegatedToName}` : t.planner.notDone}
                              </span>
                              <button
                                onClick={() => undelegateTask(item.task.id, item.date)}
                                title={t.planner.cancelDelegation}
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

                        {/* Tâches déléguées vers moi que j'ai acceptées */}
                        {getAcceptedDelegationsToMe().map((item, idx) => (
                          <div key={`accepted-${item.task.id}-${idx}`} className={`${styles.myTaskCard} ${styles.validatedTask}`}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '70px' }}>
                              <span style={{ fontWeight: 500 }}>
                                {item.date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }}>
                                Via {item.delegatorName}
                              </span>
                            </div>
                            <div className={styles.myTaskInfo}>
                              <strong>{item.task.title}</strong>
                              <span className={styles.taskMeta}>{item.task.duration} min</span>
                            </div>
                            <div className={styles.validationBtns}>
                              <span className={styles.validatedBadge}><Icon name="check" size={12} style={{ marginRight: '4px' }} />+{item.points} pts</span>
                              <button
                                onClick={() => validateTask(item.task.id, item.date, false)}
                                title={t.planner.cancelValidation}
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
                      </div>
                    )}
                  </div>
                )}

                {/* Tâche exceptionnelle */}
                <div className={styles.monEspaceSection}>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="star" size={16} />{t.planner.addExceptionalTask}</h4>
                  <p className={styles.mutedSmall}>{t.planner.exceptionalTaskDesc}</p>
                  
                  <div className={styles.exceptionalForm}>
                    <input
                      value={newExceptionalTask.title}
                      onChange={(e) => setNewExceptionalTask(prev => ({ ...prev, title: e.target.value }))}
                      placeholder={t.planner.exceptionalTaskPlaceholder}
                      className={styles.exceptionalInput}
                    />
                    <div className={styles.exceptionalNumbers}>
                      <div className={styles.numberField}>
                        <label>{t.planner.duration}</label>
                        <input
                          type="number"
                          value={newExceptionalTask.duration}
                          onChange={(e) => setNewExceptionalTask(prev => ({ ...prev, duration: Number(e.target.value) }))}
                          min={5}
                        />
                      </div>
                      <div className={styles.numberField}>
                        <label>{t.planner.penibility}</label>
                        <input
                          type="number"
                          value={newExceptionalTask.penibility}
                          onChange={(e) => setNewExceptionalTask(prev => ({ ...prev, penibility: Number(e.target.value) }))}
                          min={0}
                          max={100}
                        />
                      </div>
                      <div className={styles.numberField}>
                        <label>{t.common.pts}</label>
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
                      ➕ {t.planner.addAndEarnPoints}
                    </button>
                  </div>

                  {/* Liste des tâches exceptionnelles */}
                  {getMyExceptionalTasks().length > 0 && (
                    <div className={styles.exceptionalList}>
                      <h5><Icon name="star" size={14} />{t.planner.myExceptionalTasks} ({getMyExceptionalTasks().length})</h5>
                      {getMyExceptionalTasks().map(task => (
                        <div key={task.id} className={styles.myTaskCard}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '70px' }}>
                            <span style={{ fontWeight: 500 }}>
                              {new Date(task.date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                              {new Date(task.date).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className={styles.myTaskInfo}>
                            <strong>{task.title}</strong>
                            <span className={styles.taskMeta}>{task.duration} {t.common.minutes} · {t.planner.penibilityShort} {task.penibility}%</span>
                          </div>
                          <span className={styles.taskPoints}>+{calculateExceptionalPoints(task)} pts</span>
                          <button
                            onClick={() => deleteExceptionalTask(task.id)}
                            title={t.planner.deleteTask}
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
              <h3>{t.planner.taskManagement}</h3>
            
            {!selectedFamily && (
              <div className={styles.warningBox}>
                <Icon name="warning" size={16} />
                <span>{t.planner.createFamilyForTasks}</span>
              </div>
            )}

            {/* Formulaire d'ajout */}
            <div className={styles.taskFormCard}>
              <h4><Icon name="circlePlus" size={18} />{t.planner.newTask}</h4>
              
              <div className={styles.taskFormGrid}>
                <div className={styles.taskFormField}>
                  <label>{t.planner.taskName}</label>
                  <input
                    value={newTask.title}
                    onChange={(e) => setNewTask((t) => ({ ...t, title: e.target.value }))}
                    placeholder={t.planner.taskPlaceholder}
                  />
                </div>

                <div className={styles.taskFormField}>
                  <label>{t.planner.duration}</label>
                  <input
                    type="number"
                    value={newTask.duration}
                    onChange={(e) => setNewTask((t) => ({ ...t, duration: Number(e.target.value) }))}
                    min={5}
                  />
                </div>

                <div className={styles.taskFormField}>
                  <label>{t.planner.penibility}</label>
                  <input
                    type="number"
                    value={newTask.penibility}
                    onChange={(e) => setNewTask((t) => ({ ...t, penibility: Number(e.target.value) }))}
                    min={0}
                    max={100}
                  />
                </div>

                <div className={`${styles.taskFormField} ${styles.fullWidth}`}>
                  <label>{t.planner.slots}</label>
                  <div className={styles.scheduleBuilder}>
                    <select value={newTaskDay} onChange={(e) => setNewTaskDay(e.target.value)}>
                      {dayOptions.map((day) => (
                        <option key={day} value={day}>{translateDay(day)}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={styles.smallButton}
                      onClick={() => {
                        if (newTaskTimeMode === "slot") {
                          setNewTaskTimeMode("time");
                          setNewTaskTime("08:00");
                        } else {
                          setNewTaskTimeMode("slot");
                          setNewTaskTime("Matin");
                        }
                      }}
                      title={newTaskTimeMode === "slot" ? t.planner.switchExactTime : t.planner.switchSlot}
                    >
                      <Icon name="clock" size={12} />
                    </button>
                    {newTaskTimeMode === "slot" ? (
                      <select value={newTaskTime} onChange={(e) => setNewTaskTime(e.target.value)}>
                        {timeSlotOptions.map((ts) => (
                          <option key={ts} value={ts}>{translateTime(ts)}</option>
                        ))}
                      </select>
                    ) : (
                      <input type="time" value={newTaskTime} onChange={(e) => setNewTaskTime(e.target.value)} />
                    )}
                    <button type="button" className={styles.smallButton} onClick={addNewTaskSchedule}>
                      <Icon name="circlePlus" size={12} />
                      {t.common.add}
                    </button>
                  </div>
                  <div className={styles.scheduleChips}>
                    {newTaskSchedules.length === 0 ? (
                      <span className={styles.mutedSmall}>{t.planner.noSlots}</span>
                    ) : (
                      newTaskSchedules.map((entry) => (
                        <button
                          key={entry}
                          type="button"
                          className={styles.scheduleChip}
                          onClick={() => removeNewTaskSchedule(entry)}
                          title={`${t.planner.removeEntry} ${translateSlot(entry)}`}
                        >
                          <Icon name="trash" size={11} />
                          {translateSlot(entry)}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.taskOptionToggles}>
                <label className={styles.taskOptionToggle}>
                  <input
                    type="checkbox"
                    checked={newTaskIsCooking}
                    onChange={(e) => setNewTaskIsCooking(e.target.checked)}
                  />
                  <span>{t.planner.cookingTaskLabel}</span>
                </label>
                <label className={styles.taskOptionToggle}>
                  <input
                    type="checkbox"
                    checked={newTaskIsRecurring}
                    onChange={(e) => setNewTaskIsRecurring(e.target.checked)}
                  />
                  <span>{t.planner.recurringRegistration}</span>
                </label>
              </div>

              <div className={styles.taskFormActions}>
                <button 
                  className={styles.addTaskBtn} 
                  onClick={addTask}
                  disabled={!newTask.title.trim() || !selectedFamily}
                >
                  <Icon name="circlePlus" size={16} />
                  {t.planner.addTask}
                </button>
              </div>
            </div>

            {/* Liste des tâches */}
            <div className={styles.taskListHeader}>
              <h4>
                <Icon name="listCheck" size={18} />
                {t.planner.allTasksList}
                <span className={styles.taskCount}>{familyTasks.length}</span>
              </h4>
            </div>

            {/* Evaluation Progress Banner - Desktop */}
            {currentUser && familyTasks.length > 0 && (
              <div className={`${styles.evalBanner} ${getUserEvaluationCount(currentUser) >= familyTasks.length ? styles.evalBannerSuccess : ''}`}>
                <Icon name={getUserEvaluationCount(currentUser) >= familyTasks.length ? "check" : "sliders"} size={16} />
                <span>
                  {getUserEvaluationCount(currentUser) >= familyTasks.length 
                    ? t.planner.allEvaluatedFull
                    : `${t.planner.personalEvalsShort}: ${getUserEvaluationCount(currentUser)}/${familyTasks.length} ${t.common.tasks} — ${t.planner.evalToImprove}`
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
                          <label className={styles.label}>{t.planner.nameLabel}</label>
                          <input
                            value={editTaskDraft.title}
                            onChange={(e) => setEditTaskDraft((t) => ({ ...t, title: e.target.value }))}
                            placeholder={t.planner.taskName}
                          />
                          <label className={styles.label}>{t.planner.duration}</label>
                          <input
                            type="number"
                            value={editTaskDraft.duration}
                            onChange={(e) => setEditTaskDraft((t) => ({ ...t, duration: Number(e.target.value) }))}
                            min={5}
                          />
                          <label className={styles.label}>{t.planner.penibility}</label>
                          <input
                            type="number"
                            value={editTaskDraft.penibility}
                            onChange={(e) => setEditTaskDraft((t) => ({ ...t, penibility: Number(e.target.value) }))}
                            min={0}
                            max={100}
                          />
                          <label className={styles.label}>{t.planner.addSlot}</label>
                          <div className={styles.scheduleBuilder}>
                            <select
                              value={getScheduleDraft(task.id).day}
                              onChange={(e) => updateScheduleDraft(task.id, { day: e.target.value })}
                            >
                              {dayOptions.map((day) => (
                                <option key={day} value={day}>{translateDay(day)}</option>
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
                          <label className={styles.label}>{t.planner.slots}</label>
                          <div className={styles.scheduleChips}>
                            {schedules.map((entry) => (
                              <button
                                key={entry}
                                type="button"
                                className={styles.scheduleChip}
                                onClick={() => removeScheduleFromTask(task.id, entry)}
                                disabled={schedules.length <= 1}
                                title={`${t.planner.removeEntry} ${translateSlot(entry)}`}
                              >
                                <Icon name="trash" size={11} />
                                {translateSlot(entry)}
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
                              {t.common.save}
                            </button>
                            <button className={styles.smallGhost} onClick={cancelEditTask}>
                              {t.common.cancel}
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
                              aria-label={getMyEvaluation(task.id) ? t.planner.editEvaluation : t.planner.evaluateTask}
                              title={getMyEvaluation(task.id) ? t.planner.editEvaluation : t.planner.evaluateTask}
                            >
                              <Icon name={getMyEvaluation(task.id) ? "check" : "sliders"} size={14} />
                            </button>
                            <button
                              className={styles.editBtn}
                              onClick={() => startEditTask(task)}
                              aria-label={t.common.edit}
                              title={t.common.edit}
                            >
                              <Icon name="pen" size={14} />
                            </button>
                            <button
                              className={styles.deleteBtn}
                              onClick={() => deleteTask(task.id)}
                              aria-label={t.common.delete}
                              title={t.common.delete}
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
                  <p>{t.planner.noTasks}</p>
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
              <h3>{t.planner.familyCalendar}</h3>
              <div className={styles.calendarControls}>
                <button onClick={() => openCreateEventForm()}>
                  <Icon name="plus" size={14} style={{ marginRight: '6px' }} />{t.planner.newEvent}
                </button>
                <button onClick={() => setShowMemberSettings(!showMemberSettings)}>
                  {showMemberSettings ? t.planner.viewCalendar : <><Icon name="gear" size={14} style={{ marginRight: '6px' }} />{t.planner.memberSettings}</>}
                </button>
              </div>
            </div>

            {showMemberSettings ? (
              <div className={styles.memberSettings}>
                <h4>{t.planner.calendarSettings}</h4>
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
                            title={t.planner.memberColor}
                            className={styles.hiddenColorInput}
                          />
                        </label>
                        <span className={styles.memberName}>{member.name}</span>
                      </div>
                      <div className={styles.memberInputs}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>{t.planner.icalLink}</span>
                          <input
                            type="text"
                            placeholder={t.planner.icalPlaceholder}
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
                              const manualText = prompt(t.planner.pasteIcalHere);
                              if (manualText) {
                                updateMemberLocalState(member.id, "calendarUrl", manualText);
                              }
                            }
                          }}
                          title={t.planner.pasteFromClipboard}
                        >
                          <Icon name="paste" size={12} style={{ marginRight: '4px' }} />{t.common.paste}
                        </button>
                        <button
                          type="button"
                          className={styles.saveBtn}
                          onClick={() => {
                            updateMemberCalendarSettings(member.membershipId, member.color, member.calendarUrl);
                            alert(t.planner.urlSaved);
                          }}
                        >
                          <Icon name="circleCheck" size={12} style={{ marginRight: '4px' }} />Sauvegarder
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={styles.helpBox}>
                  <strong>{t.planner.howToGetIcal}</strong>
                  <ol>
                    <li>{t.planner.icalStep1}</li>
                    <li>{t.planner.icalStep2}</li>
                    <li>{t.planner.icalStep3}</li>
                    <li>{t.planner.icalStep4}</li>
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
                    {t.planner.today}
                  </button>
                </div>

                <div className={styles.calendarContainer}>
                  <div className={styles.calendarWeekHeader}>
                    {dayOptions.map((day) => (
                      <div key={day} className={styles.weekDay}>{translateDay(day)}</div>
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
                                  {event.allDay ? t.timeSlots.allDay : new Date(event.start).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
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
                  <h4>{t.planner.members}</h4>
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
                          <strong>Date :</strong> {new Date(selectedEvent.start).toLocaleDateString(locale, { 
                            weekday: "long", 
                            year: "numeric", 
                            month: "long", 
                            day: "numeric" 
                          })}
                        </p>
                        {!selectedEvent.allDay && (
                          <p>
                            <strong>Heure :</strong> {new Date(selectedEvent.start).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                            {selectedEvent.end && ` - ${new Date(selectedEvent.end).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`}
                          </p>
                        )}
                        {selectedEvent.location && (
                          <p><strong>{t.planner.location}</strong> {selectedEvent.location}</p>
                        )}
                        {selectedEvent.description && (
                          <p><strong>{t.planner.description}</strong> {selectedEvent.description}</p>
                        )}
                        {selectedEvent.isLocal && selectedEvent.userId === currentUser ? (
                          <div className={styles.eventModalActions}>
                            <button onClick={() => { setSelectedEvent(null); openEditEventForm(selectedEvent); }}>
                              <Icon name="pen" size={14} /> {t.common.edit}
                            </button>
                            <button className={styles.eventDeleteBtn} onClick={() => handleEventDelete(selectedEvent.localEventId)}>
                              <Icon name="trash" size={14} /> {t.common.delete}
                            </button>
                          </div>
                        ) : (
                          <p className={styles.unavailableNote} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Icon name="warning" size={14} />{selectedEvent.userName} {t.planner.unavailableDuring}
                          </p>
                        )}
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
              <h3>{t.planner.myPlanning}</h3>
              <div className={styles.plannerNav}>
                <button onClick={() => navigatePlannerDays(-1)} className={styles.navBtn}>
                  <Icon name="arrowLeft" size={12} />
                  <span>{t.planner.previous}</span>
                </button>
                <button 
                  onClick={() => setPlannerStartDate(new Date())} 
                  className={styles.todayBtn}
                >
                  {t.planner.today}
                </button>
                <button onClick={() => navigatePlannerDays(1)} className={styles.navBtn}>
                  <span>{t.planner.next}</span>
                  <Icon name="arrowRight" size={12} />
                </button>
              </div>
              <button
                onClick={() => autoAssign()}
                className={`${styles.autoAssignBtn} ${isAllWeekAssigned ? styles.autoAssignBtnDone : ''}`}
                title={isAllWeekAssigned ? t.planner.allTasksAssigned : t.planner.autoAssign}
              >
                <Icon name="sparkles" size={14} />
                {t.planner.autoAssignLabel}
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
                      {isToday && <span className={styles.todayBadge}>{t.planner.today}</span>}
                    </div>

                    {/* Afficher les indisponibilités du jour */}
                    {myUnavailabilities.length > 0 && (
                      <div className={styles.dayUnavailabilities}>
                        <div className={styles.unavailabilityHeader}>
                          <Icon name="warning" size={14} />
                          {t.planner.myUnavailabilities}
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
                            const assignedNames = assignedUserIds.map(id => {
                              const name = users.find(u => u.id === id)?.name;
                              const dish = task.isCooking && assignment?.dishes?.[id];
                              return dish ? `${name} (${dish})` : name;
                            }).filter(Boolean).join(', ');
                            const taskKey = getTaskAssignmentKey(task.id, day);

                            return (
                              <div 
                                key={task.id} 
                                className={`${styles.plannerTask} ${isAssignedToMe ? styles.myTask : ''} ${isAssignedToOther ? styles.takenTask : ''} ${iAmBusy && !isAssignedToOther && !isAssignedToMe ? styles.busyTask : ''}`}
                              >
                                <div className={styles.plannerTaskInfo}>
                                  <strong>{task.title}{task.isRecurring && <span className={styles.recurringBadge} title={t.planner.recurring}> ↻</span>}</strong>
                                  <span className={styles.taskDetails}>
                                    {task.duration} {t.common.minutes} · {t.planner.penibilityShort} {task.penibility}%
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
                                      {t.planner.takenByMe}{task.isCooking && assignment?.dishes?.[currentUser || ''] ? ` (${assignment.dishes[currentUser || '']})` : ''}{assignedUserIds.length > 1 ? ` (+${assignedUserIds.length - 1})` : ''} · {t.common.cancel}
                                    </button>
                                  )}
                                  {assignedUserIds.length === 0 && !iAmBusy && (
                                    <button 
                                      className={styles.claimBtn}
                                      onClick={() => claimTask(task.id, day)}
                                    >
                                      {t.planner.claimTask}
                                    </button>
                                  )}
                                  {isPartiallyAssigned && !isAssignedToMe && !iAmBusy && (
                                    <button 
                                      className={styles.claimBtn}
                                      onClick={() => claimTask(task.id, day)}
                                    >
                                      {t.planner.register}
                                    </button>
                                  )}
                                  {assignedUserIds.length === 0 && iAmBusy && (
                                    <span className={styles.busyBadge}>
                                      <Icon name="warning" size={12} />
                                      {t.planner.unavailable}
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
                                        title={t.planner.manageRegistration}
                                      >
                                        <Icon name="users" size={12} />
                                      </button>
                                      {adminAssignMenu?.key === taskKey && (
                                        <div className={styles.adminAssignDropdown}>
                                          <div className={styles.adminAssignHeader}>{t.planner.assignMember}</div>
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
                      <p className={styles.noTasks}>{t.planner.noTasksThisDay}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.plannerLegend}>
              <div className={styles.legendRow}>
                <span className={styles.legendSample} style={{ backgroundColor: 'rgba(100, 200, 100, 0.2)', borderLeft: '3px solid #64c864' }}></span>
                <span>{t.planner.takenByMe}</span>
              </div>
              <div className={styles.legendRow}>
                <span className={styles.legendSample} style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', borderLeft: '3px solid #ef4444' }}></span>
                <span>{t.planner.takenBySomeoneElse}</span>
              </div>
              <div className={styles.legendRow}>
                <span className={styles.legendSample} style={{ backgroundColor: 'rgba(255, 200, 100, 0.15)', borderLeft: '3px solid #ffc864' }}></span>
                <span>{t.planner.iAmUnavailable}</span>
              </div>
              <div className={styles.legendRow}>
                <span className={styles.legendSample} style={{ backgroundColor: 'transparent', borderLeft: '3px solid var(--border)' }}></span>
                <span>{t.planner.available}</span>
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
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="target" size={18} />{t.planner.weeklyEquity}</span>
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
                  title={t.planner.howPointsCalculated}
                >
                  ?
                </button>
              </h3>
              {!selectedFamily ? (
                <p className={styles.mutedSmall} style={{ color: "#ff6b6b", display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon name="warning" size={14} />{t.planner.selectFamilyQuotas}
                </p>
              ) : familyUsers.length === 0 ? (
                <p className={styles.mutedSmall}>{t.planner.noMembers}</p>
              ) : getActiveMembers().length === 0 ? (
                <p className={styles.mutedSmall}>{t.planner.noActiveRanking}</p>
              ) : (
                <>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon name="listCheck" size={16} />{t.planner.weeklyGoals}
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
                              {user.name} {isMe && <span className={styles.meBadge}>{t.common.me}</span>}
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
                              <span className={styles.remaining}>{t.planner.remaining} {remaining} pts</span>
                            ) : (
                              <span className={styles.completed} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Icon name="circleCheck" size={12} />{t.planner.quotaReached}</span>
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
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="trophy" size={18} />{t.planner.ranking}</h3>
              {!selectedFamily ? (
                <p className={styles.mutedSmall} style={{ color: "#ff6b6b", display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon name="warning" size={14} />{t.planner.selectFamilyRanking}
                </p>
              ) : familyUsers.length === 0 ? (
                <p className={styles.mutedSmall}>{t.planner.noMembers}</p>
              ) : (
                <>
                  <div className={styles.rankingFilters}>
                    <div className={styles.rankingFilterGroup}>
                      <button className={`${styles.rankingFilterBtn} ${rankingPeriod === 'week' ? styles.rankingFilterActive : ''}`} onClick={() => setRankingPeriod('week')}>{t.planner.week}</button>
                      <button className={`${styles.rankingFilterBtn} ${rankingPeriod === 'month' ? styles.rankingFilterActive : ''}`} onClick={() => setRankingPeriod('month')}>{t.planner.month}</button>
                      <button className={`${styles.rankingFilterBtn} ${rankingPeriod === 'all' ? styles.rankingFilterActive : ''}`} onClick={() => setRankingPeriod('all')}>{t.planner.allTime}</button>
                    </div>
                    <div className={styles.rankingFilterGroup}>
                      <button className={`${styles.rankingFilterBtn} ${rankingMetric === 'points' ? styles.rankingFilterActive : ''}`} onClick={() => setRankingMetric('points')}>{t.common.pts}</button>
                      <button className={`${styles.rankingFilterBtn} ${rankingMetric === 'tasks' ? styles.rankingFilterActive : ''}`} onClick={() => setRankingMetric('tasks')}>{t.common.tasks}</button>
                      <button className={`${styles.rankingFilterBtn} ${rankingMetric === 'time' ? styles.rankingFilterActive : ''}`} onClick={() => setRankingMetric('time')}>{t.planner.timeLabel}</button>
                    </div>
                  </div>
                  {getFilteredLeaderboard().map((user, idx) => {
                    const maxValue = getFilteredMaxValue();
                    const percentage = maxValue > 0 ? (user.value / maxValue) * 100 : 0;
                    const isMe = user.id === currentUser;

                    return (
                      <div
                        key={user.id}
                        className={`${styles.scoreRow} ${isMe ? styles.myScoreRow : ''} ${styles.clickableRow}`}
                        onClick={() => setPointsHistoryModal({ userId: user.id, userName: user.name })}
                        title={t.planner.clickViewHistory}
                      >
                        <div className={styles.rankBadge}>
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                        </div>
                        <div className={styles.scoreUserInfo}>
                          <p>{user.name} {isMe && <span className={styles.meBadge}>{t.common.me}</span>}</p>
                          <span className={styles.taskMeta}>{formatMetricSubtext(user)}</span>
                        </div>
                        <div className={styles.scoreBar}>
                          <div style={{ width: `${percentage}%` }} />
                        </div>
                        <div className={styles.scorePointsWithIcon}>
                          <strong className={styles.scorePoints}>{formatMetricValue(user.value)}</strong>
                          <Icon name="chevronRight" size={14} style={{ color: 'var(--color-text-muted)' }} />
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Stats */}
            <div className={styles.impactCard}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="chartBar" size={18} />{t.planner.statistics}</h3>
              {selectedFamily && familyUsers.length > 0 && (
                <>
                  <div className={styles.statsGrid}>
                    <div className={styles.statItem}>
                      <span className={styles.statValue}>
                        {getFamilyLeaderboard().reduce((sum, u) => sum + u.totalPoints, 0)}
                      </span>
                      <span className={styles.statLabel}>{t.planner.totalFamilyPoints}</span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statValue}>
                        {getFamilyLeaderboard().reduce((sum, u) => sum + u.validatedCount, 0)}
                      </span>
                      <span className={styles.statLabel}>{t.planner.validatedTasks}</span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statValue}>
                        {Math.round(getFamilyLeaderboard().reduce((sum, u) => sum + u.totalPoints, 0) / Math.max(getActiveMembers().length, 1))}
                      </span>
                      <span className={styles.statLabel}>{t.planner.averagePerActive}</span>
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
              <h4><Icon name="help" size={20} /> {t.planner.howGoalsCalculated}</h4>
            </div>
            <div className={styles.historyModalBody} style={{ padding: '16px' }}>
              {/* Calcul détaillé */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* Étape 1 : Points totaux disponibles */}
                <div style={{ background: 'var(--color-bg-subtle)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: 'var(--color-primary)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>1</span>
                    {t.planner.availablePointsWeek}
                  </div>
                  <div style={{ marginLeft: '28px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                    {t.planner.addAllPointsDesc}
                  </div>
                  <div style={{ marginLeft: '28px', marginTop: '8px', fontWeight: 600, color: 'var(--color-primary)' }}>
                    = {getWeeklyAvailablePoints()} {t.planner.pointsInTotal}
                  </div>
                  <div style={{ marginLeft: '28px', marginTop: '4px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    ({familyTasks.length} {familyTasks.length > 1 ? t.planner.tasksConfigured : t.planner.taskConfigured})
                  </div>
                </div>

                {/* Étape 2 : Division par nombre de membres actifs */}
                <div style={{ background: 'var(--color-bg-subtle)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: 'var(--color-primary)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>2</span>
                    {t.planner.quotaPerPerson}
                  </div>
                  <div style={{ marginLeft: '28px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                    {getWeeklyAvailablePoints()} pts ÷ {getActiveMembers().length} {getActiveMembers().length > 1 ? t.planner.membersActive : t.planner.memberActive}
                    {getActiveMembers().length < familyUsers.length && (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginLeft: '4px' }}>
                        ({familyUsers.length - getActiveMembers().length} désactivé{familyUsers.length - getActiveMembers().length > 1 ? 's' : ''})
                      </span>
                    )}
                  </div>
                  <div style={{ marginLeft: '28px', marginTop: '8px', fontWeight: 600, color: 'var(--color-primary)' }}>
                    = {getWeeklyQuotaPerPerson()} {t.planner.ptsPerPerson}
                  </div>
                </div>

                {/* Étape 3 : Ajustements */}
                <div style={{ background: 'var(--color-bg-subtle)', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: 'var(--color-primary)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>3</span>
                    {t.planner.personalAdjustments}
                  </div>
                  <div style={{ marginLeft: '28px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                    <div>• {t.planner.absencesHelp}</div>
                    <div style={{ marginTop: '4px' }}>• {t.planner.carryoverHelp}</div>
                  </div>
                </div>

                {/* Récap pour l'utilisateur courant */}
                {currentUser && (
                  <div style={{ background: 'var(--color-primary-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-primary)' }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon name="user" size={16} />
                      {t.planner.yourGoalWeek}
                    </div>
                    <div style={{ marginLeft: '24px', fontSize: '14px' }}>
                      <div>{t.planner.baseQuota} : {getWeeklyQuotaPerPerson()} pts</div>
                      {getUserAbsenceDaysForWeek(currentUser, getWeekStart(new Date())) > 0 && (
                        <div style={{ color: 'var(--color-warning)' }}>
                          − {Math.round(getWeeklyQuotaPerPerson() * getUserAbsenceDaysForWeek(currentUser, getWeekStart(new Date())) / 7)} pts (absence {getUserAbsenceDaysForWeek(currentUser, getWeekStart(new Date()))}j)
                        </div>
                      )}
                      {getLastWeekBalance(currentUser) !== 0 && (
                        <div style={{ color: getLastWeekBalance(currentUser) > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                          {getLastWeekBalance(currentUser) > 0 ? '−' : '+'} {Math.abs(getLastWeekBalance(currentUser))} {t.common.pts} ({t.planner.lastWeekCarryover})
                        </div>
                      )}
                      <div style={{ marginTop: '8px', fontWeight: 700, fontSize: '16px', color: 'var(--color-primary)' }}>
                        = {getAdjustedQuota(currentUser)} {t.planner.ptsToDoWeek}
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        {t.planner.alreadyDone} : {getUserPointsForWeek(currentUser, getWeekStart(new Date()))} pts •
                        {t.planner.rest} : {getRemainingQuota(currentUser)} pts
                      </div>
                    </div>
                  </div>
                )}

                {/* Détail semaine dernière */}
                {currentUser && (
                  <details style={{ marginTop: '8px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 500, color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                      📊 {t.planner.lastWeekDetails} {getLastWeekBalance(currentUser) !== 0 ? `(${t.planner.carryoverOf} ${Math.abs(getLastWeekBalance(currentUser))} pts)` : `(${t.planner.noCarryover})`}
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
                              <span>{t.planner.weekOfShort} {lastWeekStart.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} - {lastWeekEnd.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span>
                              {isFromHistory && (
                                <span style={{ fontSize: '11px', background: 'var(--color-success)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>✓ {t.planner.history}</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>{t.planner.pointsEarned} : <strong>{pointsLastWeek}</strong> {t.common.pts}</span>
                              <button
                                onClick={() => {
                                  const newPoints = prompt(`${t.planner.correctPointsPrompt} (${pointsLastWeek}) :`, String(pointsLastWeek));
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
                                ✏️ {t.planner.correct}
                              </button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>{t.planner.expectedQuota} : <strong>{quotaLastWeek}</strong> pts</span>
                              <button
                                onClick={() => {
                                  const newQuota = prompt(`${t.planner.correctQuotaPrompt} (${quotaLastWeek}) :`, String(quotaLastWeek));
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
                                ✏️ {t.planner.correct}
                              </button>
                            </div>
                            <div style={{ marginTop: '4px', fontWeight: 600, color: pointsLastWeek >= quotaLastWeek ? 'var(--color-success)' : 'var(--color-error)' }}>
                              {t.planner.balanceLabel} : {pointsLastWeek} - {quotaLastWeek} = {pointsLastWeek - quotaLastWeek} pts
                            </div>
                            {!isFromHistory && (
                              <div style={{ marginTop: '8px', padding: '8px', background: 'var(--color-warning)', borderRadius: '4px', fontSize: '12px', color: 'white' }}>
                                ⚠️ {t.planner.estimatedWarning}
                              </div>
                            )}
                            {isFromHistory && (
                              <button
                                onClick={() => {
                                  if (confirm(t.planner.deleteHistoryConfirm)) {
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
                                🗑️ {t.planner.deleteHistory}
                              </button>
                            )}
                            {isFromHistory && calculatedPoints !== pointsLastWeek && (
                              <div style={{ marginTop: '8px', padding: '8px', background: 'var(--color-primary-subtle)', borderRadius: '4px', fontSize: '12px' }}>
                                <div style={{ marginBottom: '4px' }}>
                                  💡 {t.planner.calculatedPointsNote} : <strong>{calculatedPoints}</strong> pts ({t.planner.differenceNote})
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
                                  🔄 {t.planner.updateWith} {calculatedPoints} pts
                                </button>
                              </div>
                            )}
                            
                            {/* Liste des tâches validées la semaine dernière */}
                            <details style={{ marginTop: '12px' }}>
                              <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                📋 {t.planner.taskDetailsDetected} ({validatedTasks.filter(v => {
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
                                        <strong>{task?.title || t.planner.unknownTask}</strong> - {localDate.toLocaleDateString(locale)}
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
                                        <strong>⭐ {t.title}</strong> - {localDate.toLocaleDateString(locale)}
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
                                    {t.planner.noValidatedTasks}
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
                    {t.planner.viewTaskDetails} ({familyTasks.length})
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
              <h4><Icon name="trophy" size={20} /> {t.planner.historyOf} {pointsHistoryModal.userName}</h4>
              <p className={styles.historyTotalPoints}>
                Total : <strong>{getUserTotalPoints(pointsHistoryModal.userId)} points</strong>
              </p>
            </div>
            <div className={styles.historyModalBody}>
              {getUserPointsHistory(pointsHistoryModal.userId).length === 0 ? (
                <p className={styles.emptyHistory}>{t.planner.noPointsYet}</p>
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
                            {new Date(item.date).toLocaleDateString(locale, {
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
    return `${start.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;
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
      <>
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
                <button className={styles.mobileIconBtn} onClick={() => setShowSuggestionModal(true)} title={t.planner.suggestIdea}>
                  <Icon name="lightbulb" size={20} />
                </button>
                <Link href="/settings" className={styles.mobileIconBtn} title={t.common.settings}>
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
                      <span className={styles.mobilePointsLabel}>{t.planner.myPoints}</span>
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
                      <span className={styles.mobileStatLabel}>{t.planner.toDo}</span>
                    </div>
                    <div className={styles.mobileStatCard}>
                      <span className={styles.mobileStatValue}>{getMyPastTasks().filter(t => !t.validated).length}</span>
                      <span className={styles.mobileStatLabel}>{t.planner.toValidate}</span>
                    </div>
                    <div className={styles.mobileStatCard}>
                      <span className={styles.mobileStatValue}>{currentUser ? getUserPointsHistory(currentUser).length : 0}</span>
                      <span className={styles.mobileStatLabel}>{t.planner.thisWeekShort}</span>
                    </div>
                  </div>

                  {/* Upcoming Tasks - Compact List */}
                  {getMyUpcomingTasks().length > 0 && (
                    <div className={styles.mobileSection}>
                      <h3 className={styles.mobileSectionTitle}>
                        <Icon name="clipboardList" size={16} />
                        {t.planner.upcomingTasks}
                      </h3>
                      <div className={styles.mobileTaskList}>
                        {getMyUpcomingTasks().slice(0, 4).map((item, idx) => {
                          const mobileUpcomingAssignment = getTaskAssignment(item.task.id, item.date);
                          const mobileMyDish = item.task.isCooking && mobileUpcomingAssignment?.dishes?.[currentUser || ''];
                          return (
                          <div key={`mobile-task-${idx}`} className={styles.mobileTaskItem}>
                            <div className={styles.mobileTaskLeft}>
                              <span className={styles.mobileTaskTitle}>{item.task.title}{item.task.isRecurring && <span className={styles.recurringBadge} title={t.planner.recurring}> ↻</span>}</span>
                              {mobileMyDish && <span className={styles.dishLabel}>{mobileMyDish}</span>}
                              <span className={styles.mobileTaskMeta}>
                                {item.date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })} · {formatTimeDisplay(item.timeSlot)}
                              </span>
                            </div>
                            <span className={styles.mobileTaskPoints}>+{item.points}</span>
                          </div>
                          );
                        })}
                        {getMyUpcomingTasks().length > 4 && (
                          <button className={styles.mobileShowMore}>
                            {t.planner.seeAll} ({getMyUpcomingTasks().length})
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
                        {t.planner.toValidate}
                      </h3>
                      <div className={styles.mobileTaskList}>
                        {/* Delegated tasks from others */}
                        {getDelegatedToMeTasks().map((item, idx) => (
                          <div key={`delegated-mobile-${idx}`} className={styles.mobileValidateItem} style={{ borderLeftColor: 'var(--color-primary)', borderLeftWidth: '3px', borderLeftStyle: 'solid' }}>
                            <div className={styles.mobileTaskLeft}>
                              <span className={styles.mobileTaskTitle}>{item.task.title}</span>
                              <span className={styles.mobileTaskMeta} style={{ color: 'var(--color-primary)' }}>
                                {t.planner.delegatedBy} {item.delegatorName}
                              </span>
                            </div>
                            <div className={styles.mobileValidateBtns}>
                              <button
                                className={styles.mobileValidateYes}
                                onClick={() => validateTask(item.task.id, item.date, true)}
                              >
                                <Icon name="check" size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                        {/* Own pending tasks */}
                        {getMyPastTasks().filter(t => !t.validated).slice(0, 3).map((item, idx) => (
                          <div key={`validate-${idx}`} className={styles.mobileValidateItem}>
                            <div className={styles.mobileTaskLeft}>
                              <span className={styles.mobileTaskTitle}>{item.task.title}</span>
                              <span className={styles.mobileTaskMeta}>
                                {item.date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
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
                  {currentUser && (getUserPointsHistory(currentUser).length > 0 || getMyDelegatedTasks().length > 0) && (
                    <div className={styles.mobileSection}>
                      <button
                        className={styles.mobileHistoryToggle}
                        onClick={() => setMobileHistoryOpen(!mobileHistoryOpen)}
                      >
                        <div className={styles.mobileHistoryToggleLeft}>
                          <Icon name="check" size={16} />
                          <span>{t.planner.history} ({getUserPointsHistory(currentUser).length + getMyDelegatedTasks().length})</span>
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
                                  {new Date(item.date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
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
                                  title={t.planner.cancelValidation}
                                >
                                  <Icon name="x" size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                          {/* Delegated tasks */}
                          {getMyDelegatedTasks().map((item, idx) => (
                            <div key={`delegated-hist-${idx}`} className={styles.mobileHistoryItem} style={{ opacity: 0.7 }}>
                              <div className={styles.mobileTaskLeft}>
                                <span className={styles.mobileTaskTitle}>{item.task.title}</span>
                                <span className={styles.mobileTaskMeta} style={{ color: item.delegatedToName ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                                  {item.delegatedToName ? `${t.planner.doneBy} ${item.delegatedToName}` : t.planner.notDone}
                                </span>
                              </div>
                              <div className={styles.mobileHistoryRight}>
                                <button
                                  className={styles.mobileCancelValidationBtn}
                                  onClick={() => undelegateTask(item.task.id, item.date)}
                                  title={t.planner.cancelDelegation}
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
                        <span>{t.planner.exceptionalTask}</span>
                      </div>
                      <Icon name={mobileShowExceptionalForm ? "chevronDown" : "plus"} size={16} />
                    </button>
                    {mobileShowExceptionalForm && (
                      <div className={styles.mobileExceptionalForm}>
                        <input
                          type="text"
                          className={styles.mobileInput}
                          placeholder={t.planner.taskName}
                          value={newExceptionalTask.title}
                          onChange={(e) => setNewExceptionalTask(prev => ({ ...prev, title: e.target.value }))}
                        />
                        <div className={styles.mobileInputRowEqual}>
                          <div className={styles.mobileInputGroupCompact}>
                            <label>{t.planner.durationLabel}</label>
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
                            <label>{t.planner.penibilityShort}</label>
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
                            {t.common.add}
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
                    {t.planner.autoAssignLabel}
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
                          <span className={styles.mobileDayName}>{day.toLocaleDateString(locale, { weekday: 'short' })}</span>
                          <span className={styles.mobileDayNum}>{day.getDate()}</span>
                          {dayTasks.length > 0 && <span className={styles.mobileDayDot}></span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected Day Tasks */}
                  <div className={styles.mobileSection}>
                    <h3 className={styles.mobileSectionTitle}>
                      {(selectedMobileDay || new Date()).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                    </h3>
                    <div className={styles.mobileTaskList}>
                      {getDayTasks(selectedMobileDay || new Date()).length === 0 ? (
                        <p className={styles.mobileEmptyState}>{t.planner.noTasksThisDay}</p>
                      ) : (
                        getDayTasks(selectedMobileDay || new Date()).map((item, idx) => {
                          const currentDay = selectedMobileDay || new Date();
                          const assignment = getTaskAssignment(item.task.id, currentDay);
                          const assignedUserIds = assignment?.userIds || [];
                          const isMyTask = assignedUserIds.includes(currentUser || '');
                          const isAssigned = assignedUserIds.length > 0;
                          const iAmBusy = currentUser ? isUserBusyAtTime(currentUser, currentDay, item.timeSlot) : false;
                          const firstAssignedUser = assignedUserIds[0];
                          const assignedNames = assignedUserIds.map(id => {
                            const name = users.find(u => u.id === id)?.name;
                            const dish = item.task.isCooking && assignment?.dishes?.[id];
                            return dish ? `${name} (${dish})` : name;
                          }).filter(Boolean).join(', ');
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
                                  <span className={styles.mobileTaskTitle}>{item.task.title}{item.task.isRecurring && <span className={styles.recurringBadge} title={t.planner.recurring}> ↻</span>}</span>
                                  <span className={styles.mobileTaskMeta}>
                                    {formatTimeDisplay(item.timeSlot)} · {isAssigned ? assignedNames || t.planner.unknownUser : t.planner.freeSlot}
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
                                    {t.planner.unregister}
                                  </button>
                                ) : iAmBusy ? (
                                  <span className={styles.mobileBusyLabel}>
                                    <Icon name="clock" size={14} />
                                    {t.planner.busy}
                                  </span>
                                ) : (
                                  <button
                                    className={styles.mobileRegisterBtn}
                                    onClick={() => claimTask(item.task.id, currentDay)}
                                  >
                                    <Icon name="check" size={14} />
                                    {isAssigned ? t.planner.register : t.planner.register}
                                  </button>
                                )}
                                {isAssigned && !isMyTask && (
                                  <span className={styles.mobileAssignedLabel}>
                                    {t.planner.takenBy} {assignedNames}
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
                                        title={t.planner.manageRegistration}
                                      >
                                        <Icon name="users" size={14} />
                                      </button>
                                      {adminAssignMenu?.key === mobileTaskKey && (
                                        <div className={styles.adminAssignDropdown}>
                                          <div className={styles.adminAssignHeader}>{t.planner.assignMember}</div>
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
                        <span>{t.planner.weeklyGoal}</span>
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
                              ? <><Icon name="check" size={14} style={{ color: 'var(--color-success)', marginRight: '4px' }} />{t.planner.goalReached}</>
                              : `${getQuotaWithAbsences(currentUser, getWeekStart(new Date())) - getUserPointsForWeek(currentUser, getWeekStart(new Date()))} ${t.planner.remaining}`
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Leaderboard */}
                  <div className={styles.mobileLeaderboard}>
                    <div className={styles.rankingFilters}>
                      <div className={styles.rankingFilterGroup}>
                        <button className={`${styles.rankingFilterBtn} ${rankingPeriod === 'week' ? styles.rankingFilterActive : ''}`} onClick={() => setRankingPeriod('week')}>{t.planner.week}</button>
                        <button className={`${styles.rankingFilterBtn} ${rankingPeriod === 'month' ? styles.rankingFilterActive : ''}`} onClick={() => setRankingPeriod('month')}>{t.planner.month}</button>
                        <button className={`${styles.rankingFilterBtn} ${rankingPeriod === 'all' ? styles.rankingFilterActive : ''}`} onClick={() => setRankingPeriod('all')}>{t.planner.allTime}</button>
                      </div>
                      <div className={styles.rankingFilterGroup}>
                        <button className={`${styles.rankingFilterBtn} ${rankingMetric === 'points' ? styles.rankingFilterActive : ''}`} onClick={() => setRankingMetric('points')}>{t.common.pts}</button>
                        <button className={`${styles.rankingFilterBtn} ${rankingMetric === 'tasks' ? styles.rankingFilterActive : ''}`} onClick={() => setRankingMetric('tasks')}>{t.common.tasks}</button>
                        <button className={`${styles.rankingFilterBtn} ${rankingMetric === 'time' ? styles.rankingFilterActive : ''}`} onClick={() => setRankingMetric('time')}>{t.planner.timeLabel}</button>
                      </div>
                    </div>
                    {getFilteredLeaderboard().map((user, idx) => (
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
                        <span className={styles.mobileLeaderName}>{user.name} {user.id === currentUser && <span className={styles.meBadge}>{t.common.me}</span>}</span>
                        <span className={styles.mobileLeaderPoints}>{formatMetricValue(user.value)}</span>
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
                          <p className={styles.mobileEmptyState}>{t.planner.noActivity}</p>
                        ) : (
                          getUserPointsHistory(mobileSelectedUser).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10).map((item, idx) => (
                            <div key={idx} className={styles.mobileActivityItem}>
                              <div className={styles.mobileActivityInfo}>
                                <span className={styles.mobileActivityTitle}>{item.title}</span>
                                <span className={styles.mobileActivityMeta}>{new Date(item.date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
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
                        placeholder={t.planner.searchTask}
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
                        {t.planner.newTask}
                      </h4>
                      <input
                        type="text"
                        className={styles.mobileInput}
                        placeholder={t.planner.taskName}
                        value={newTask.title}
                        onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      />
                      <div className={styles.mobileInputRowEqual}>
                        <div className={styles.mobileInputGroupCompact}>
                          <label>{t.planner.durationLabel}</label>
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
                          <label>{t.planner.penibilityShort}</label>
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
                        <label className={styles.mobileScheduleLabel}>{t.planner.slots}</label>
                        <div className={styles.mobileScheduleAdd}>
                          <select
                            className={styles.mobileSelectCompact}
                            value={newTaskDay}
                            onChange={(e) => setNewTaskDay(e.target.value)}
                          >
                            {dayOptions.map(d => <option key={d} value={d}>{translateDay(d)}</option>)}
                          </select>
                          <button
                            type="button"
                            className={styles.mobileAddScheduleBtn}
                            onClick={() => {
                              if (newTaskTimeMode === "slot") {
                                setNewTaskTimeMode("time");
                                setNewTaskTime("08:00");
                              } else {
                                setNewTaskTimeMode("slot");
                                setNewTaskTime("Matin");
                              }
                            }}
                            title={newTaskTimeMode === "slot" ? t.planner.switchExactTime : t.planner.switchSlot}
                          >
                            <Icon name="clock" size={14} />
                          </button>
                          {newTaskTimeMode === "slot" ? (
                            <select
                              className={styles.mobileSelectCompact}
                              value={newTaskTime}
                              onChange={(e) => setNewTaskTime(e.target.value)}
                            >
                              {timeSlotOptions.map((ts) => (
                                <option key={ts} value={ts}>{translateTime(ts)}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="time"
                              className={styles.mobileTimeInput}
                              value={newTaskTime}
                              onChange={(e) => setNewTaskTime(e.target.value)}
                            />
                          )}
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
                                <span>{translateSlot(slot)}</span>
                                <button onClick={() => setMobileNewTaskSchedules(mobileNewTaskSchedules.filter((_, i) => i !== idx))}>
                                  <Icon name="x" size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className={styles.taskOptionToggles}>
                        <label className={styles.taskOptionToggle}>
                          <input
                            type="checkbox"
                            checked={newTaskIsCooking}
                            onChange={(e) => setNewTaskIsCooking(e.target.checked)}
                          />
                          <span>{t.planner.cookingTaskLabel}</span>
                        </label>
                        <label className={styles.taskOptionToggle}>
                          <input
                            type="checkbox"
                            checked={newTaskIsRecurring}
                            onChange={(e) => setNewTaskIsRecurring(e.target.checked)}
                          />
                          <span>{t.planner.recurringRegistration}</span>
                        </label>
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
                        {t.planner.createTask}
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
                            ? t.planner.allEvaluated
                            : `${t.planner.evaluationsCount}: ${getUserEvaluationCount(currentUser)}/${tasks.length} ${t.common.tasks}`
                          }
                        </span>
                      </div>
                    )}
                    <h3 className={styles.mobileSectionTitle}>
                      <Icon name="clipboardList" size={16} />
                      {t.planner.allTasksList} ({tasks.filter(t => t.title.toLowerCase().includes(taskSearch.toLowerCase())).length})
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
                                <label>{t.planner.durationLabel}</label>
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
                                <label>{t.planner.penibilityShort}</label>
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
                              <label className={styles.mobileScheduleLabel}>{t.planner.slots}</label>
                              <div className={styles.mobileScheduleList}>
                                {(task.schedules || [task.slot]).map((slot, idx) => (
                                  <div key={idx} className={styles.mobileScheduleChip}>
                                    <span>{translateSlot(slot)}</span>
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
                                  {dayOptions.map(d => <option key={d} value={d}>{translateDay(d)}</option>)}
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
                                {t.common.save2}
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
                              title={getMyEvaluation(task.id) ? t.planner.editEvaluation : t.planner.evaluateTask}
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
                    >{t.planner.month}</button>
                    <button
                      className={`${styles.mobileViewBtn} ${mobileCalendarView === 'week' ? styles.mobileViewBtnActive : ''}`}
                      onClick={() => setMobileCalendarView('week')}
                    >{t.planner.week}</button>
                    <button
                      className={`${styles.mobileViewBtn} ${mobileCalendarView === 'day' ? styles.mobileViewBtnActive : ''}`}
                      onClick={() => setMobileCalendarView('day')}
                    >{t.planner.day}</button>
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
                        ? selectedCalendarDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
                        : mobileCalendarView === 'week' && selectedCalendarDay
                        ? `Sem. du ${getWeekStart(selectedCalendarDay).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`
                        : calendarMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
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
                        {selectedCalendarDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                      </h4>
                      {getEventsForDate(selectedCalendarDay).length === 0 ? (
                        <p className={styles.mobileEmptyState}>{t.planner.noUnavailability}</p>
                      ) : (
                        <div className={styles.mobileSelectedDayList}>
                          {getEventsForDate(selectedCalendarDay).map((event, idx) => {
                            const member = calendarMembers.find(m => m.userId === event.userId);
                            const user = users.find(u => u.id === event.userId);
                            return (
                              <div key={idx} className={styles.mobileDayEvent}
                                onClick={() => event.isLocal && event.userId === currentUser ? openEditEventForm(event) : setSelectedEvent(event)}
                                style={{ cursor: 'pointer' }}
                              >
                                <div
                                  className={styles.mobileDayEventColor}
                                  style={{ backgroundColor: member?.color || `hsl(${(users.findIndex(u => u.id === event.userId) * 60) % 360}, 60%, 50%)` }}
                                />
                                <div className={styles.mobileDayEventInfo}>
                                  <span className={styles.mobileDayEventTitle}>{event.title}</span>
                                  <span className={styles.mobileDayEventTime}>
                                    {event.allDay ? t.planner.allDayEvent : `${new Date(event.start).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} - ${new Date(event.end).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`}
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
                                <span className={styles.mobileWeekDayName}>{day.toLocaleDateString(locale, { weekday: 'short' })}</span>
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
                                      <span className={styles.mobileWeekEventTitle}>{event.title}</span>
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
                        {selectedCalendarDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                      </h4>
                      {getEventsForDate(selectedCalendarDay).length === 0 ? (
                        <p className={styles.mobileEmptyState}>{t.planner.noUnavailability}</p>
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
                                  <span className={styles.mobileDayEventTitle}>{event.title}</span>
                                  <span className={styles.mobileDayEventTime}>
                                    {event.allDay ? t.planner.allDayEvent : `${new Date(event.start).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} - ${new Date(event.end).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`}
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
                        <p className={styles.mobileEmptyState}>{t.planner.noEvents}</p>
                      ) : (
                        getEventsForDate(selectedCalendarDay).map((event, idx) => {
                          const member = calendarMembers.find(m => m.userId === event.userId);
                          const user = users.find(u => u.id === event.userId);
                          return (
                            <div key={idx} className={styles.mobileDayEvent}
                              onClick={() => event.isLocal && event.userId === currentUser ? openEditEventForm(event) : setSelectedEvent(event)}
                              style={{ cursor: 'pointer' }}
                            >
                              <div
                                className={styles.mobileDayEventColor}
                                style={{ backgroundColor: member?.color || `hsl(${(users.findIndex(u => u.id === event.userId) * 60) % 360}, 60%, 50%)` }}
                              />
                              <div className={styles.mobileDayEventInfo}>
                                <span className={styles.mobileDayEventTitle}>{event.title}</span>
                                <span className={styles.mobileDayEventTime}>
                                  {event.allDay ? t.planner.allDayEvent : `${new Date(event.start).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} - ${new Date(event.end).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`}
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
                  <h3 className={styles.mobileDelegationTitle}>{t.planner.whoDidTask}</h3>
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
                      <span>{t.planner.nobody}</span>
                    </button>
                  </div>
                  <button
                    className={styles.mobileDelegationCancel}
                    onClick={() => setMobileDelegationModal(null)}
                  >
                    {t.common.cancel}
                  </button>
                </div>
              </div>
            )}

            {/* Dish Input Modal */}
            {dishModal && (
              <div className={styles.eventModal} onClick={() => setDishModal(null)}>
                <div className={styles.dishModalContent} onClick={(e) => e.stopPropagation()}>
                  <div className={styles.dishModalHeader}>
                    <h4>{t.planner.whatDish}</h4>
                  </div>
                  <div className={styles.dishModalBody}>
                    <input
                      type="text"
                      value={dishInput}
                      onChange={(e) => setDishInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmDishAndClaim(); }}
                      placeholder={t.planner.dishPlaceholder}
                      className={styles.dishModalInput}
                      autoFocus
                    />
                    <div className={styles.dishModalActions}>
                      <button className={styles.dishModalCancel} onClick={() => setDishModal(null)}>{t.common.cancel}</button>
                      <button className={styles.dishModalConfirm} onClick={confirmDishAndClaim}>{t.common.confirm}</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile Evaluation Modal */}
            {showEvaluationModal && (
              <div className={styles.mobileDelegationOverlay}>
                <div className={styles.mobileEvaluationModal}>
                  <h3 className={styles.mobileDelegationTitle}>
                    {t.planner.myEvaluation}
                    <span className={styles.mobileEvalSubtitle}>
                      {tasks.find(t => t.id === showEvaluationModal)?.title}
                    </span>
                  </h3>
                  <p className={styles.mobileEvalExplain}>
                    {t.planner.evalInstructions}
                  </p>

                  <div className={styles.mobileEvalInputs}>
                    <div className={styles.mobileEvalInputGroup}>
                      <label>{t.planner.estimatedDuration}</label>
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
                      <label>{t.planner.perceivedPenibility}</label>
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
                      {t.planner.pointsMedianHelp}
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
                      {t.planner.saveBtnLabel}
                    </button>
                    <button
                      className={styles.mobileDelegationCancel}
                      onClick={() => setShowEvaluationModal(null)}
                    >
                      {t.common.cancel}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Suggestion Modal (mobile) */}
      {showSuggestionModal && (
        <div className={styles.modalOverlay} onClick={() => { setShowSuggestionModal(false); setSuggestionMessage(""); }}>
          <div className={styles.evaluationModal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.evaluationModalTitle}>{t.planner.suggestIdea}</h3>
            <p className={styles.evaluationModalSubtitle}>
              {t.planner.suggestIdeaDesc}
            </p>
            <textarea
              value={suggestionText}
              onChange={(e) => setSuggestionText(e.target.value)}
              placeholder={t.planner.describeIdea}
              rows={4}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-subtle)',
                color: 'var(--color-text)',
                fontSize: '0.875rem',
                resize: 'vertical',
                fontFamily: 'inherit',
                marginBottom: '12px',
              }}
            />
            {suggestionMessage && (
              <p style={{ fontSize: '0.8rem', marginBottom: '12px', color: suggestionMessage.includes('Merci') ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #ef4444)' }}>
                {suggestionMessage}
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                className={styles.autoAssignErrorCancel}
                onClick={() => { setShowSuggestionModal(false); setSuggestionMessage(""); }}
              >
                {t.common.cancel}
              </button>
              <button
                className={styles.autoAssignErrorBtn}
                disabled={!suggestionText.trim() || suggestionMessage === "Merci pour votre suggestion !"}
                onClick={() => {
                  const content = suggestionText.trim();
                  if (!content) return;
                  setSuggestionMessage("Merci pour votre suggestion !");
                  setSuggestionText("");
                  setTimeout(() => { setShowSuggestionModal(false); setSuggestionMessage(""); }, 1500);
                  fetch("/api/suggestions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      userId: currentUser,
                      familyId: selectedFamily,
                      content,
                    }),
                  }).catch(() => {});
                }}
              >
                {t.common.send}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event form modal */}
      {showEventForm && (
        <div className={styles.eventModal} onClick={() => { setShowEventForm(false); setEditingEvent(null); }}>
          <div className={styles.eventModalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <button className={styles.closeModal} onClick={() => { setShowEventForm(false); setEditingEvent(null); }}>×</button>
            <div className={styles.eventModalHeader} style={{ backgroundColor: 'var(--color-primary)' }}>
              <h4>{editingEvent ? t.planner.editEvent : t.planner.newEvent}</h4>
            </div>
            <div className={styles.eventModalBody}>
              <form onSubmit={handleEventSubmit} className={styles.eventForm}>
                <label className={styles.eventFormLabel}>{t.planner.titleRequired}</label>
                <input
                  type="text"
                  className={styles.eventFormInput}
                  value={eventFormData.title}
                  onChange={(e) => setEventFormData({ ...eventFormData, title: e.target.value })}
                  required
                  placeholder={t.planner.eventTitle}
                />

                <label className={styles.eventFormLabel}>Date *</label>
                <input
                  type="date"
                  className={styles.eventFormInput}
                  value={eventFormData.date}
                  onChange={(e) => setEventFormData({ ...eventFormData, date: e.target.value })}
                  required
                />

                <label className={styles.eventFormCheckbox}>
                  <input
                    type="checkbox"
                    checked={eventFormData.allDay}
                    onChange={(e) => setEventFormData({ ...eventFormData, allDay: e.target.checked })}
                  />
                  {t.planner.allDayEvent}
                </label>

                {!eventFormData.allDay && (
                  <div className={styles.eventFormRow}>
                    <div className={styles.eventFormField}>
                      <label className={styles.eventFormLabel}>{t.planner.start}</label>
                      <input
                        type="time"
                        className={styles.eventFormInput}
                        value={eventFormData.startTime}
                        onChange={(e) => setEventFormData({ ...eventFormData, startTime: e.target.value })}
                      />
                    </div>
                    <div className={styles.eventFormField}>
                      <label className={styles.eventFormLabel}>{t.planner.end}</label>
                      <input
                        type="time"
                        className={styles.eventFormInput}
                        value={eventFormData.endTime}
                        onChange={(e) => setEventFormData({ ...eventFormData, endTime: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                <label className={styles.eventFormLabel}>{t.planner.descriptionOptional}</label>
                <textarea
                  className={styles.eventFormTextarea}
                  value={eventFormData.description}
                  onChange={(e) => setEventFormData({ ...eventFormData, description: e.target.value })}
                  placeholder={t.planner.descriptionOptional}
                  rows={3}
                />

                <label className={styles.eventFormLabel}>{t.planner.locationOptional}</label>
                <input
                  type="text"
                  className={styles.eventFormInput}
                  value={eventFormData.location}
                  onChange={(e) => setEventFormData({ ...eventFormData, location: e.target.value })}
                  placeholder={t.planner.locationOptional}
                />

                <label className={styles.eventFormLabel}>{t.planner.recurrence}</label>
                <select
                  className={styles.eventFormSelect}
                  value={eventFormData.recurrence}
                  onChange={(e) => setEventFormData({ ...eventFormData, recurrence: e.target.value })}
                >
                  <option value="none">{t.planner.recurrenceNone}</option>
                  <option value="daily">{t.planner.daily}</option>
                  <option value="weekly">{t.planner.weeklyRecurrence}</option>
                  <option value="monthly">{t.planner.monthlyRecurrence}</option>
                  <option value="yearly">{t.planner.yearly}</option>
                </select>

                {eventFormData.recurrence !== "none" && (
                  <>
                    <label className={styles.eventFormLabel}>{t.planner.recurrenceEnd}</label>
                    <input
                      type="date"
                      className={styles.eventFormInput}
                      value={eventFormData.recurrenceEnd}
                      onChange={(e) => setEventFormData({ ...eventFormData, recurrenceEnd: e.target.value })}
                    />
                  </>
                )}

                <div className={styles.eventFormActions}>
                  <button type="button" className={styles.eventFormCancel} onClick={() => { setShowEventForm(false); setEditingEvent(null); }}>
                    {t.common.cancel}
                  </button>
                  {editingEvent && (
                    <button type="button" className={styles.eventFormDelete} onClick={() => handleEventDelete()}>
                      <Icon name="trash" size={14} /> {t.common.delete}
                    </button>
                  )}
                  <button type="submit" className={styles.eventFormSubmit}>
                    <Icon name="check" size={14} /> {editingEvent ? t.common.edit : t.common.create}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      </>
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
            <p className={styles.brandSubtitle}>{t.planner.familyOrganization}</p>
          </div>
        </div>
        <div className={styles.topActions}>
          <button
            className={styles.themeToggle}
            onClick={() => setShowSuggestionModal(true)}
            title={t.planner.suggestIdea}
          >
            <Icon name="lightbulb" size={18} />
            <span className={styles.themeLabel}>{t.planner.idea}</span>
          </button>
          <Link href="/settings" className={styles.settingsLink} title={t.common.settings}>
            <Icon name="gear" size={18} />
          </Link>
          {currentUserEntity && <span className={styles.userChip}>{currentUserEntity.name}</span>}
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
              {t.planner.myPersonalEvaluation}
            </h3>
            <p className={styles.evaluationModalSubtitle}>
              {tasks.find(t => t.id === showEvaluationModal)?.title}
            </p>
            <p className={styles.evaluationModalExplain}>
              {t.planner.evalInstructionsDesktop}
            </p>
            
            <div className={styles.evaluationModalInputs}>
              <div className={styles.evaluationModalField}>
                <label>{t.planner.estimatedDurationMinutes}</label>
                <input
                  type="number"
                  value={pendingEvaluation.duration}
                  onChange={(e) => setPendingEvaluation(prev => ({ ...prev, duration: parseInt(e.target.value) || 0 }))}
                  min={5}
                  max={240}
                />
              </div>
              <div className={styles.evaluationModalField}>
                <label>{t.planner.perceivedPenibilityPercent}</label>
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
                {t.planner.pointsMedianDesktop}
                {' '}{t.planner.autoAssignMedianHelp}
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
                {t.planner.saveBtnLabel}
              </button>
              <button
                className={styles.evaluationModalCancel}
                onClick={() => setShowEvaluationModal(null)}
              >
                {t.common.cancel}
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
            <h3 className={styles.autoAssignErrorTitle}>{t.planner.incompleteEvals}</h3>
            <p className={styles.autoAssignErrorText}>
              {t.planner.allMustEval}
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
              {t.planner.eachMustEvalAll}
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
                {t.planner.evalTasks}
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

      {/* Suggestion Modal */}
      {showSuggestionModal && (
        <div className={styles.modalOverlay} onClick={() => { setShowSuggestionModal(false); setSuggestionMessage(""); }}>
          <div className={styles.evaluationModal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.evaluationModalTitle}>{t.planner.suggestIdea}</h3>
            <p className={styles.evaluationModalSubtitle}>
              {t.planner.suggestIdeaDesc}
            </p>
            <textarea
              value={suggestionText}
              onChange={(e) => setSuggestionText(e.target.value)}
              placeholder={t.planner.describeIdea}
              rows={4}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-subtle)',
                color: 'var(--color-text)',
                fontSize: '0.875rem',
                resize: 'vertical',
                fontFamily: 'inherit',
                marginBottom: '12px',
              }}
            />
            {suggestionMessage && (
              <p style={{ fontSize: '0.8rem', marginBottom: '12px', color: suggestionMessage.includes('Merci') ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #ef4444)' }}>
                {suggestionMessage}
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                className={styles.autoAssignErrorCancel}
                onClick={() => { setShowSuggestionModal(false); setSuggestionMessage(""); }}
              >
                {t.common.cancel}
              </button>
              <button
                className={styles.autoAssignErrorBtn}
                disabled={!suggestionText.trim() || suggestionMessage === "Merci pour votre suggestion !"}
                onClick={() => {
                  const content = suggestionText.trim();
                  if (!content) return;
                  setSuggestionMessage("Merci pour votre suggestion !");
                  setSuggestionText("");
                  setTimeout(() => { setShowSuggestionModal(false); setSuggestionMessage(""); }, 1500);
                  fetch("/api/suggestions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      userId: currentUser,
                      familyId: selectedFamily,
                      content,
                    }),
                  }).catch(() => {});
                }}
              >
                {t.common.send}
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
                aria-label={t.planner.viewDetails}
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

      {/* Event form modal */}
      {showEventForm && (
        <div className={styles.eventModal} onClick={() => { setShowEventForm(false); setEditingEvent(null); }}>
          <div className={styles.eventModalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <button className={styles.closeModal} onClick={() => { setShowEventForm(false); setEditingEvent(null); }}>×</button>
            <div className={styles.eventModalHeader} style={{ backgroundColor: 'var(--color-primary)' }}>
              <h4>{editingEvent ? t.planner.editEvent : t.planner.newEvent}</h4>
            </div>
            <div className={styles.eventModalBody}>
              <form onSubmit={handleEventSubmit} className={styles.eventForm}>
                <label className={styles.eventFormLabel}>{t.planner.titleRequired}</label>
                <input
                  type="text"
                  className={styles.eventFormInput}
                  value={eventFormData.title}
                  onChange={(e) => setEventFormData({ ...eventFormData, title: e.target.value })}
                  required
                  placeholder={t.planner.eventTitle}
                />

                <label className={styles.eventFormLabel}>Date *</label>
                <input
                  type="date"
                  className={styles.eventFormInput}
                  value={eventFormData.date}
                  onChange={(e) => setEventFormData({ ...eventFormData, date: e.target.value })}
                  required
                />

                <label className={styles.eventFormCheckbox}>
                  <input
                    type="checkbox"
                    checked={eventFormData.allDay}
                    onChange={(e) => setEventFormData({ ...eventFormData, allDay: e.target.checked })}
                  />
                  {t.planner.allDayEvent}
                </label>

                {!eventFormData.allDay && (
                  <div className={styles.eventFormRow}>
                    <div className={styles.eventFormField}>
                      <label className={styles.eventFormLabel}>{t.planner.start}</label>
                      <input
                        type="time"
                        className={styles.eventFormInput}
                        value={eventFormData.startTime}
                        onChange={(e) => setEventFormData({ ...eventFormData, startTime: e.target.value })}
                      />
                    </div>
                    <div className={styles.eventFormField}>
                      <label className={styles.eventFormLabel}>{t.planner.end}</label>
                      <input
                        type="time"
                        className={styles.eventFormInput}
                        value={eventFormData.endTime}
                        onChange={(e) => setEventFormData({ ...eventFormData, endTime: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                <label className={styles.eventFormLabel}>{t.planner.descriptionOptional}</label>
                <textarea
                  className={styles.eventFormTextarea}
                  value={eventFormData.description}
                  onChange={(e) => setEventFormData({ ...eventFormData, description: e.target.value })}
                  placeholder={t.planner.descriptionOptional}
                  rows={3}
                />

                <label className={styles.eventFormLabel}>{t.planner.locationOptional}</label>
                <input
                  type="text"
                  className={styles.eventFormInput}
                  value={eventFormData.location}
                  onChange={(e) => setEventFormData({ ...eventFormData, location: e.target.value })}
                  placeholder={t.planner.locationOptional}
                />

                <label className={styles.eventFormLabel}>{t.planner.recurrence}</label>
                <select
                  className={styles.eventFormSelect}
                  value={eventFormData.recurrence}
                  onChange={(e) => setEventFormData({ ...eventFormData, recurrence: e.target.value })}
                >
                  <option value="none">{t.planner.recurrenceNone}</option>
                  <option value="daily">{t.planner.daily}</option>
                  <option value="weekly">{t.planner.weeklyRecurrence}</option>
                  <option value="monthly">{t.planner.monthlyRecurrence}</option>
                  <option value="yearly">{t.planner.yearly}</option>
                </select>

                {eventFormData.recurrence !== "none" && (
                  <>
                    <label className={styles.eventFormLabel}>{t.planner.recurrenceEnd}</label>
                    <input
                      type="date"
                      className={styles.eventFormInput}
                      value={eventFormData.recurrenceEnd}
                      onChange={(e) => setEventFormData({ ...eventFormData, recurrenceEnd: e.target.value })}
                    />
                  </>
                )}

                <div className={styles.eventFormActions}>
                  <button type="button" className={styles.eventFormCancel} onClick={() => { setShowEventForm(false); setEditingEvent(null); }}>
                    {t.common.cancel}
                  </button>
                  {editingEvent && (
                    <button type="button" className={styles.eventFormDelete} onClick={() => handleEventDelete()}>
                      <Icon name="trash" size={14} /> {t.common.delete}
                    </button>
                  )}
                  <button type="submit" className={styles.eventFormSubmit}>
                    <Icon name="check" size={14} /> {editingEvent ? t.common.edit : t.common.create}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Dish Input Modal (Desktop) */}
      {dishModal && (
        <div className={styles.eventModal} onClick={() => setDishModal(null)}>
          <div className={styles.dishModalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dishModalHeader}>
              <h4>{t.planner.whatDish}</h4>
            </div>
            <div className={styles.dishModalBody}>
              <input
                type="text"
                value={dishInput}
                onChange={(e) => setDishInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmDishAndClaim(); }}
                placeholder={t.planner.dishPlaceholder}
                className={styles.dishModalInput}
                autoFocus
              />
              <div className={styles.dishModalActions}>
                <button className={styles.dishModalCancel} onClick={() => setDishModal(null)}>{t.common.cancel}</button>
                <button className={styles.dishModalConfirm} onClick={confirmDishAndClaim}>{t.common.confirm}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
