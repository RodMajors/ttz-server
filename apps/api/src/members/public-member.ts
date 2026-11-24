import { serializePublicCharacter } from "./characters.service";

type PublicMemberSource = {
  id: bigint;
  name: string | null;
  guildNickname: string | null;
  avatar: string | null;
  characters: Parameters<typeof serializePublicCharacter>[0][];
};

export function serializePublicMember(user: PublicMemberSource) {
  const characters = user.characters.map(serializePublicCharacter);
  const main = characters.find((character) => character.isMain) ?? null;
  return {
    id: user.id.toString(),
    name: user.name ?? user.guildNickname ?? "TTZ 成员",
    avatar: user.avatar,
    mainCharacter: main
      ? {
          id: main.id,
          name: main.name,
          realm: main.realm,
          className: main.className,
          classIconUrl: main.classIconUrl,
          classColor: main.classColor,
          raceName: main.raceName,
          activeSpecName: main.activeSpecName,
          itemLevel: main.itemLevel,
          averageItemLevel: main.averageItemLevel,
          isMain: main.isMain,
        }
      : null,
  };
}
