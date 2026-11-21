import { ConflictException } from "@nestjs/common";
import type { StrategyPresetSaveInput } from "@ttz/contracts";
import type { Prisma } from "@ttz/database";

export async function validateRequirementCatalog(
  tx: Prisma.TransactionClient,
  tasks: StrategyPresetSaveInput["tasks"],
) {
  const types = [...new Set(tasks.map((task) => task.taskTypeId))];
  const spellIds = [
    ...new Set(
      tasks.flatMap(({ encounterSpellId, playerSpellId }) =>
        [encounterSpellId, playerSpellId].filter((id): id is number => id != null),
      ),
    ),
  ];
  const [taskTypes, spells] = await Promise.all([
    types.length ? tx.strategyTaskType.findMany({ where: { id: { in: types } } }) : [],
    spellIds.length ? tx.gameSpell.findMany({ where: { id: { in: spellIds } } }) : [],
  ]);
  const typeById = new Map(taskTypes.map((entry) => [entry.id, entry]));
  const spellById = new Map(spells.map((entry) => [entry.id, entry]));
  for (const task of tasks) {
    if (!typeById.get(task.taskTypeId)?.isActive)
      throw new ConflictException({
        code: "STRATEGY_TASK_TYPE_INVALID",
        message: `任务「${task.label}」的类型不存在或已停用`,
      });
    for (const [id, source] of [
      [task.encounterSpellId, "ENCOUNTER"],
      [task.playerSpellId, "PLAYER"],
    ] as const) {
      if (id == null) continue;
      const entry = spellById.get(id);
      if (!entry?.isActive || entry.sourceType !== source)
        throw new ConflictException({
          code: "STRATEGY_TASK_SPELL_INVALID",
          message: `任务「${task.label}」的技能已停用或类别不匹配`,
        });
    }
  }
  return { typeById, spellById };
}
