import solver, { type SolveResult } from "javascript-lp-solver";
import type {
  SolverInput,
  SolverResult,
  SolverAssignment,
} from "./autoAssignSolver.types";

export function solveMILP(
  input: SolverInput,
  eligibility: Map<string, string[]>
): SolverResult {
  const { tasks, members, costs, rotations, weeklyHistory, params } = input;
  const { alpha, beta, lambdaHistory, preferenceBonus, preferenceThreshold } = params;

  const memberMap = new Map(members.map((m) => [m.userId, m]));
  const costMap = new Map<string, number>();
  for (const c of costs) {
    costMap.set(`${c.taskId}_${c.userId}`, c.cost);
  }
  const rotationMap = new Map<string, number>();
  for (const r of rotations) {
    rotationMap.set(`${r.taskId}_${r.userId}`, r.count);
  }
  const balanceMap = new Map<string, number>();
  for (const h of weeklyHistory) {
    balanceMap.set(h.userId, h.balance);
  }

  // Build LP model
  const constraints: Record<string, { equal?: number; max?: number }> = {};
  const variables: Record<string, Record<string, number>> = {};
  const binaries: Record<string, 1> = {};

  // Track per-task eligible members for reason generation
  const taskEligible = new Map<string, { userId: string; coefficient: number; cost: number; rotation: number }[]>();

  for (const task of tasks) {
    const eligible = eligibility.get(task.key) ?? [];
    if (eligible.length === 0) continue;

    // Constraint: exactly 1 member per task-day
    constraints[`task_${task.key}`] = { equal: 1 };

    const candidateInfo: { userId: string; coefficient: number; cost: number; rotation: number }[] = [];

    for (const userId of eligible) {
      const varName = `x_${task.key}_${userId}`;
      const rawCost = costMap.get(`${task.taskId}_${userId}`) ?? 0.5;
      const adjustedCost = rawCost < preferenceThreshold ? rawCost * preferenceBonus : rawCost;
      const rotationCount = rotationMap.get(`${task.taskId}_${userId}`) ?? 0;
      const coefficient = adjustedCost + beta * rotationCount;

      variables[varName] = {
        objective: coefficient,
        [`task_${task.key}`]: 1,
        [`load_${userId}`]: task.points,
      };
      binaries[varName] = 1;

      candidateInfo.push({ userId, coefficient, cost: rawCost, rotation: rotationCount });
    }

    taskEligible.set(task.key, candidateInfo);
  }

  // Slack variables and load constraints per member
  for (const member of members) {
    const balance = balanceMap.get(member.userId) ?? 0;
    const effectiveTarget = Math.max(0, member.target + lambdaHistory * balance);

    constraints[`load_${member.userId}`] = { max: effectiveTarget };

    const slackName = `slack_${member.userId}`;
    variables[slackName] = {
      objective: alpha,
      [`load_${member.userId}`]: -1,
    };
    // slack is continuous (>= 0 by default), not in binaries
  }

  const model = {
    optimize: "objective",
    opType: "min" as const,
    constraints,
    variables,
    binaries,
    options: {
      timeout: 10000,
      tolerance: 1e-6,
    },
  };

  const result = solver.Solve(model) as SolveResult;

  if (!result.feasible) {
    return { assignments: [], feasible: false, objectiveValue: 0 };
  }

  // Extract assignments from result
  const assignments: SolverAssignment[] = [];

  for (const task of tasks) {
    const eligible = eligibility.get(task.key) ?? [];
    let assignedUserId: string | null = null;

    for (const userId of eligible) {
      const varName = `x_${task.key}_${userId}`;
      const val = result[varName];
      if (typeof val === "number" && val > 0.5) {
        assignedUserId = userId;
        break;
      }
    }

    if (!assignedUserId) continue;

    const member = memberMap.get(assignedUserId);
    if (!member) continue;

    // Build reason string
    const candidates = taskEligible.get(task.key) ?? [];
    const candidateStrs = candidates
      .sort((a, b) => a.coefficient - b.coefficient)
      .map((c) => {
        const m = memberMap.get(c.userId);
        const name = m?.userName ?? c.userId;
        const marker = c.userId === assignedUserId ? "→" : " ";
        return `${marker}${name}: coeff=${c.coefficient.toFixed(3)} (coût=${c.cost.toFixed(2)}, rot=${c.rotation}×${beta})`;
      })
      .join(" | ");
    const reason = `MILP optimal. [${candidateStrs}]`;

    assignments.push({
      taskId: task.taskId,
      taskTitle: task.taskTitle,
      userId: assignedUserId,
      userName: member.userName,
      date: task.date,
      key: task.key,
      points: task.points,
      reason,
    });
  }

  return {
    assignments,
    feasible: true,
    objectiveValue: typeof result.result === "number" ? result.result : 0,
  };
}
