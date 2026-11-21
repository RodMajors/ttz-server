import { ConflictException } from "@nestjs/common";
import type { StrategyActivitySaveInput } from "@ttz/contracts";
import type { Prisma } from "@ttz/database";
import { signupStatusToCode } from "../activities/activity.constants";

type Task = {
  label: string;
  kind: string;
  executorSignupId: bigint | null;
  fallbackSignupId: bigint | null;
  targetSignupId: bigint | null;
  offsetMs?: number | null;
  windowMs?: number | null;
  playerSpell?: { classId: number | null; specId: number | null } | null;
};

export async function validateActivityTactics(
  tx: Prisma.TransactionClient,
  activityId: bigint,
  tasks: Task[],
  locking: boolean,
) {
  const ids = [
    ...new Set(
      tasks
        .flatMap((task) => [task.executorSignupId, task.fallbackSignupId, task.targetSignupId])
        .filter((id): id is bigint => id != null),
    ),
  ];
  const rows = ids.length
    ? await tx.activitySignup.findMany({
        where: { activityId, id: { in: ids } },
        include: {
          user: { select: { name: true, guildNickname: true } },
          character: { include: { characterClass: true } },
          specs: true,
        },
      })
    : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const windows = new Map<bigint, Task[]>();
  for (const task of tasks) {
    const fail = (code: string, message: string): never => {
      throw new ConflictException({ code, message: `任务「${task.label}」${message}` });
    };
    if (locking && task.executorSignupId == null) fail("STRATEGY_TASK_EXECUTOR_UNBOUND", "还没有分配主执行者");
    if (task.executorSignupId != null && task.executorSignupId === task.fallbackSignupId)
      fail("STRATEGY_TASK_DUPLICATE_EXECUTOR", "主执行者与后备不能是同一人");
    for (const [role, id] of [
      ["主执行者", task.executorSignupId],
      ["后备执行者", task.fallbackSignupId],
      ["目标", task.targetSignupId],
    ] as const) {
      if (id == null) continue;
      const row = byId.get(id);
      if (
        !row ||
        (row.status !== signupStatusToCode.CONFIRMED &&
          !(role === "后备执行者" && row.status === signupStatusToCode.BENCH))
      ) {
        fail("STRATEGY_SIGNUP_INVALID", `的${role}不在本场可用名单中，请重新分配`);
      }
      if (row && role === "主执行者") {
        if (task.playerSpell?.classId != null && task.playerSpell.classId !== row.character.classId)
          fail("STRATEGY_TASK_SKILL_CLASS_MISMATCH", "的玩家技能与主执行者职业不符");
        if (task.playerSpell?.specId != null && task.playerSpell.specId !== row.preferredSpecId)
          fail("STRATEGY_TASK_SKILL_SPEC_MISMATCH", "的玩家技能与主执行者专精不符");
      }
    }
    if (task.kind !== "TIMELINE") continue;
    if (locking && task.offsetMs == null) fail("STRATEGY_TASK_TIME_REQUIRED", "还未设置时间点");
    if (task.executorSignupId == null || task.offsetMs == null) continue;
    const start = task.offsetMs;
    const end = start + (task.windowMs ?? 1);
    const previous = windows.get(task.executorSignupId) ?? [];
    const conflict = previous.find(
      (item) => item.offsetMs != null && start < item.offsetMs + (item.windowMs ?? 1) && item.offsetMs < end,
    );
    if (conflict) fail("STRATEGY_TASK_TIME_CONFLICT", `与「${conflict.label}」安排给了同一人，且时间窗口重叠`);
    windows.set(task.executorSignupId, [...previous, task]);
  }
  function person(id: bigint | null) {
    const row = id == null ? undefined : byId.get(id);
    if (!row) return null;
    return {
      userId: String(row.userId),
      memberName: row.user.guildNickname ?? row.user.name ?? "TTZ 成员",
      characterId: String(row.character.id),
      characterName: row.character.name,
      realm: row.character.serverName,
      classId: row.character.classId,
      className: row.character.characterClass.name ?? row.character.characterClass.en_name,
      specId: row.preferredSpecId,
      specName: row.specs?.name ?? null,
    };
  }
  return (task: Task) => ({
    executor: person(task.executorSignupId),
    fallback: person(task.fallbackSignupId),
    target: person(task.targetSignupId),
  });
}

export function toBookingIds(task: StrategyActivitySaveInput["tasks"][number]) {
  return {
    executorSignupId: task.executorSignupId == null ? null : BigInt(task.executorSignupId),
    fallbackSignupId: task.fallbackSignupId == null ? null : BigInt(task.fallbackSignupId),
    targetSignupId: task.targetSignupId == null ? null : BigInt(task.targetSignupId),
  };
}

export function serializeTacticalPeople(
  task: Pick<
    Prisma.ActivityStrategySnapshotTaskGetPayload<object>,
    "executorSignupId" | "fallbackSignupId" | "targetSignupId" | "peopleSnapshot"
  >,
  locked: boolean,
) {
  return {
    executorSignupId: task.executorSignupId?.toString() ?? null,
    fallbackSignupId: task.fallbackSignupId?.toString() ?? null,
    targetSignupId: task.targetSignupId?.toString() ?? null,
    people: locked ? task.peopleSnapshot : null,
  };
}
