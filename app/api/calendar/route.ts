import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// API pour récupérer et parser les calendriers iCal
export async function GET(req: NextRequest) {
  try {
    const familyId = req.nextUrl.searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json(
        { error: "familyId required" },
        { status: 400 }
      );
    }

    // Get all members of the family with their calendar URLs
    const memberships = await prisma.membership.findMany({
      where: { familyId },
      include: { user: true },
    });

    const allEvents: any[] = [];

    for (const membership of memberships) {
      const membershipAny = membership as any;
      if (!membershipAny.calendarUrl) continue;

      try {
        // Convert webcal:// to https://
        let calendarUrl = membershipAny.calendarUrl;
        if (calendarUrl.startsWith('webcal://')) {
          calendarUrl = calendarUrl.replace('webcal://', 'https://');
        }
        
        console.log(`Fetching calendar for ${membership.user.name}: ${calendarUrl}`);
        
        // Fetch the iCal feed
        const response = await fetch(calendarUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/calendar, text/plain, */*',
          },
          cache: 'no-store',
        });

        console.log(`Response status for ${membership.user.name}: ${response.status}`);

        if (!response.ok) {
          console.error(`Failed to fetch calendar: ${response.status} ${response.statusText}`);
          continue;
        }

        const icalData = await response.text();
        console.log(`iCal data length for ${membership.user.name}: ${icalData.length}`);
        console.log(`iCal data preview: ${icalData.substring(0, 500)}`);
        
        // Parse iCal manually (simple parser for VEVENT)
        const events = parseICalEvents(icalData, membership.user.name, membershipAny.color || "#3b82f6", membership.userId);
        console.log(`Parsed ${events.length} events for ${membership.user.name}`);
        allEvents.push(...events);
      } catch (err) {
        console.error(`Failed to fetch calendar for ${membership.user.name}:`, err);
      }
    }

    return NextResponse.json(allEvents);
  } catch (error: any) {
    console.error("GET /api/calendar", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar: " + (error?.message || "Unknown error") },
      { status: 500 }
    );
  }
}

function parseICalEvents(icalData: string, userName: string, color: string, userId: string) {
  const events: any[] = [];
  const lines = icalData.split(/\r?\n/);
  
  let currentEvent: any = null;
  let inEvent = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Handle line continuation
    while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
      i++;
      line += lines[i].substring(1);
    }

    if (line.startsWith('BEGIN:VEVENT')) {
      inEvent = true;
      currentEvent = {
        userName,
        color,
        userId,
      };
    } else if (line.startsWith('END:VEVENT') && currentEvent) {
      if (currentEvent.start && currentEvent.title) {
        // Gérer les événements multi-jours (all-day events)
        if (currentEvent.allDay && currentEvent.end) {
          const expandedEvents = expandMultiDayEvent(currentEvent);
          events.push(...expandedEvents);
        } else {
          events.push(currentEvent);
        }
      }
      currentEvent = null;
      inEvent = false;
    } else if (inEvent && currentEvent) {
      if (line.startsWith('SUMMARY:')) {
        currentEvent.title = line.substring(8);
      } else if (line.startsWith('DTSTART')) {
        const dateStr = line.split(':').pop() || '';
        currentEvent.start = parseICalDate(dateStr);
        currentEvent.allDay = dateStr.length === 8; // YYYYMMDD format = all day
        currentEvent.rawStart = dateStr; // Keep raw for multi-day calculation
      } else if (line.startsWith('DTEND')) {
        const dateStr = line.split(':').pop() || '';
        currentEvent.end = parseICalDate(dateStr);
        currentEvent.rawEnd = dateStr; // Keep raw for multi-day calculation
      } else if (line.startsWith('DESCRIPTION:')) {
        currentEvent.description = line.substring(12).replace(/\\n/g, '\n');
      } else if (line.startsWith('LOCATION:')) {
        currentEvent.location = line.substring(9);
      } else if (line.startsWith('UID:')) {
        currentEvent.id = line.substring(4);
      }
    }
  }

  return events;
}

// Éclater un événement multi-jours en plusieurs événements quotidiens
function expandMultiDayEvent(event: any): any[] {
  const events: any[] = [];
  
  // Parse les dates au format YYYYMMDD
  const startStr = event.rawStart;
  const endStr = event.rawEnd;
  
  if (!startStr || !endStr || startStr.length !== 8 || endStr.length !== 8) {
    // Si pas de format all-day, retourner l'événement tel quel
    return [event];
  }
  
  // Parser les dates directement en chaînes pour éviter les problèmes de fuseau horaire
  const startYear = parseInt(startStr.substring(0, 4));
  const startMonth = parseInt(startStr.substring(4, 6));
  const startDay = parseInt(startStr.substring(6, 8));
  
  const endYear = parseInt(endStr.substring(0, 4));
  const endMonth = parseInt(endStr.substring(4, 6));
  const endDay = parseInt(endStr.substring(6, 8));
  
  // Calculer le nombre de jours en utilisant des dates UTC pour éviter les décalages
  const startDate = Date.UTC(startYear, startMonth - 1, startDay);
  const endDate = Date.UTC(endYear, endMonth - 1, endDay);
  
  const dayCount = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
  
  // Si c'est un événement d'un seul jour, retourner tel quel
  if (dayCount <= 1) {
    return [event];
  }
  
  // Créer un événement pour chaque jour
  for (let i = 0; i < dayCount; i++) {
    // Calculer la date en ajoutant i jours à la date de départ
    const dayTimestamp = startDate + (i * 24 * 60 * 60 * 1000);
    const dayDate = new Date(dayTimestamp);
    
    // Formatter en YYYY-MM-DD en UTC pour éviter les décalages de fuseau horaire
    const year = dayDate.getUTCFullYear();
    const month = String(dayDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dayDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    events.push({
      ...event,
      id: `${event.id}-day${i + 1}`,
      start: dateStr,
      end: dateStr,
      title: dayCount > 1 ? `${event.title} (jour ${i + 1}/${dayCount})` : event.title,
    });
  }
  
  return events;
}

function parseICalDate(dateStr: string): string {
  // Handle YYYYMMDD format
  if (dateStr.length === 8) {
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
  }
  
  // Handle YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ format
  if (dateStr.length >= 15) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const hour = dateStr.substring(9, 11);
    const minute = dateStr.substring(11, 13);
    const second = dateStr.substring(13, 15);
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }
  
  return dateStr;
}
