#pragma once

#include "CoreMinimal.h"
#include "VoxelTypes.generated.h"

/**
 * Типове блокове. uint8 за компактно съхранение (1 байт/воксел).
 * Стойностите са трайни — добавяй нови в КРАЯ (преди Max), за да не чупиш save.
 */
UENUM(BlueprintType)
enum class EVoxelBlock : uint8
{
	Air = 0,
	Stone,
	Dirt,
	Grass,
	Sand,
	Wood,
	Bamboo,
	Leaves,
	Water,
	Max UMETA(Hidden)
};

/** Глобални константи на voxel системата. */
namespace Voxel
{
	/** Блокове по ос в един chunk (chunk = ChunkSize^3 воксела). */
	static constexpr int32 ChunkSize = 32;

	/** Unreal единици на блок (100 uu = 1 m). */
	static constexpr float BlockSize = 100.0f;

	FORCEINLINE bool IsSolid(EVoxelBlock Block)
	{
		// За spike-а всичко освен въздух е плътно. Water/прозрачност — по-късно.
		return Block != EVoxelBlock::Air;
	}
}
