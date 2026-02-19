export interface SolverTaskDay {
  taskId: string;
  taskTitle: string;
  date: string;
  key: string;
  points: number;
  timeSlot: string;
}

export interface SolverMember {
  userId: string;
  userName: string;
  target: number;
  unavailableSlots: string[];
}

export interface SolverCostEntry {
  userId: string;
  taskId: string;
  cost: number;
}

export interface SolverRotationEntry {
  userId: string;
  taskId: string;
  count: number;
}

export interface SolverInput {
  tasks: SolverTaskDay[];
  members: SolverMember[];
  costs: SolverCostEntry[];
  rotations: SolverRotationEntry[];
  weeklyHistory: { userId: string; balance: number }[];
  params: SolverParams;
}

export interface SolverParams {
  alpha: number;
  beta: number;
  lambdaHistory: number;
  preferenceBonus: number;
  preferenceThreshold: number;
}

export interface SolverAssignment {
  taskId: string;
  taskTitle: string;
  userId: string;
  userName: string;
  date: string;
  key: string;
  points: number;
  reason: string;
}

export interface SolverResult {
  assignments: SolverAssignment[];
  feasible: boolean;
  objectiveValue: number;
}
