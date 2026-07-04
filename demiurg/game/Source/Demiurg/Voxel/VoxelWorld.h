#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VoxelTypes.h"
#include "VoxelWorld.generated.h"

class AVoxelChunk;
class UMaterialInterface;

/**
 * Мениджър на света: спавнва мрежа от chunk-ове и рутира редакции (копай/постави).
 *
 * СПАЙК ниво: фиксирана мрежа радиус ViewRadiusChunks около (0,0), единичен вертикален
 * слой (Z=0). Стрийминг около движещ се играч + вертикално стифане — по-късно (docs/07).
 */
UCLASS()
class DEMIURG_API AVoxelWorld : public AActor
{
	GENERATED_BODY()

public:
	AVoxelWorld();

	UPROPERTY(EditAnywhere, Category = "Voxel")
	int32 Seed = 1337;

	/** Радиус на мрежата от chunk-ове около началото (в chunk-ове). */
	UPROPERTY(EditAnywhere, Category = "Voxel", meta = (ClampMin = "0", ClampMax = "16"))
	int32 ViewRadiusChunks = 3;

	/** Материал за всички chunk mesh-ове (използвай material с VertexColor вход). */
	UPROPERTY(EditAnywhere, Category = "Voxel")
	TObjectPtr<UMaterialInterface> ChunkMaterial = nullptr;

	/**
	 * Редактира блок по world позиция. За КОПАЕНЕ подай точка малко ВЪТРЕ в блока
	 * (HitLocation - HitNormal * 0.5 * BlockSize) и NewBlock = Air.
	 * За ПОСТАВЯНЕ подай точка малко НАВЪН (HitLocation + HitNormal * 0.5 * BlockSize).
	 * Връща true при успех. Викай от PlayerController/Blueprint след LineTrace.
	 */
	UFUNCTION(BlueprintCallable, Category = "Voxel")
	bool EditBlockAtWorld(const FVector& WorldPos, EVoxelBlock NewBlock);

protected:
	virtual void BeginPlay() override;

private:
	UPROPERTY()
	TMap<FIntVector, TObjectPtr<AVoxelChunk>> Chunks;

	AVoxelChunk* SpawnChunk(const FIntVector& Coord);

	/** World позиция → (chunk координата, локална координата в chunk-а). */
	static void WorldToChunkLocal(const FVector& WorldPos, FIntVector& OutChunk, FIntVector& OutLocal);
};
