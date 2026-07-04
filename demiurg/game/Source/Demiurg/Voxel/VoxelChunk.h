#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VoxelTypes.h"
#include "VoxelChunk.generated.h"

class UProceduralMeshComponent;
class UMaterialInterface;

/**
 * Един chunk (ChunkSize^3 воксела), рендериран като ЕДИН mesh (1 draw call),
 * не блок по блок. Meshing = face culling (рендерираме само лица до въздух).
 *
 * СПАЙК ниво: face culling + vertex цветове (без текстури). Greedy meshing е
 * следващата оптимизация — виж коментара в RebuildMesh(). Виж docs/07 §1, §4.
 */
UCLASS()
class DEMIURG_API AVoxelChunk : public AActor
{
	GENERATED_BODY()

public:
	AVoxelChunk();

	/** Координата на chunk-а в chunk-единици (не world units). */
	UPROPERTY(VisibleAnywhere, Category = "Voxel")
	FIntVector ChunkCoord = FIntVector::ZeroValue;

	/** Материал за mesh-а (по избор; ако е null — default). Използвай material с VertexColor вход. */
	UPROPERTY(EditAnywhere, Category = "Voxel")
	TObjectPtr<UMaterialInterface> Material = nullptr;

	/** Генерира блоковете (placeholder heightmap) и построява mesh-а. */
	void Initialize(const FIntVector& InChunkCoord, int32 InSeed);

	/** Чете блок в локални координати [0..ChunkSize). Извън обхват → Air. */
	EVoxelBlock GetBlockLocal(int32 X, int32 Y, int32 Z) const;

	/** Записва блок в локални координати и (по избор) пре-mesh-ва. */
	void SetBlockLocal(int32 X, int32 Y, int32 Z, EVoxelBlock Block, bool bRemesh = true);

	/** Построява отново целия mesh от текущите данни. */
	void RebuildMesh();

private:
	UPROPERTY()
	TObjectPtr<UProceduralMeshComponent> Mesh = nullptr;

	/** Плосък масив: index = X + Y*ChunkSize + Z*ChunkSize^2. */
	TArray<uint8> Blocks;

	int32 Seed = 0;

	void GenerateBlocks();

	FORCEINLINE int32 BlockIndex(int32 X, int32 Y, int32 Z) const
	{
		return X + Y * Voxel::ChunkSize + Z * Voxel::ChunkSize * Voxel::ChunkSize;
	}

	/** true ако (X,Y,Z) е плътен. Извън обхват → false (третира се като въздух). */
	bool IsSolidLocal(int32 X, int32 Y, int32 Z) const;
};
