#include "VoxelWorld.h"
#include "VoxelChunk.h"
#include "Engine/World.h"

AVoxelWorld::AVoxelWorld()
{
	PrimaryActorTick.bCanEverTick = false;
}

void AVoxelWorld::BeginPlay()
{
	Super::BeginPlay();

	for (int32 cx = -ViewRadiusChunks; cx <= ViewRadiusChunks; ++cx)
	{
		for (int32 cy = -ViewRadiusChunks; cy <= ViewRadiusChunks; ++cy)
		{
			SpawnChunk(FIntVector(cx, cy, 0));
		}
	}
}

AVoxelChunk* AVoxelWorld::SpawnChunk(const FIntVector& Coord)
{
	if (TObjectPtr<AVoxelChunk>* Existing = Chunks.Find(Coord))
	{
		return *Existing;
	}

	UWorld* World = GetWorld();
	if (!World)
	{
		return nullptr;
	}

	FActorSpawnParameters Params;
	Params.Owner = this;
	AVoxelChunk* Chunk = World->SpawnActor<AVoxelChunk>(AVoxelChunk::StaticClass(), FTransform::Identity, Params);
	if (Chunk)
	{
		Chunk->Material = ChunkMaterial;
		Chunk->Initialize(Coord, Seed);
		Chunks.Add(Coord, Chunk);
	}
	return Chunk;
}

void AVoxelWorld::WorldToChunkLocal(const FVector& WorldPos, FIntVector& OutChunk, FIntVector& OutLocal)
{
	const float B = Voxel::BlockSize;
	const int32 CS = Voxel::ChunkSize;

	const int32 GX = FMath::FloorToInt(WorldPos.X / B);
	const int32 GY = FMath::FloorToInt(WorldPos.Y / B);
	const int32 GZ = FMath::FloorToInt(WorldPos.Z / B);

	OutChunk = FIntVector(
		FMath::FloorToInt(static_cast<float>(GX) / CS),
		FMath::FloorToInt(static_cast<float>(GY) / CS),
		FMath::FloorToInt(static_cast<float>(GZ) / CS));

	// Локална координата винаги в [0..CS) (FloorToInt на дробта пази знака коректно).
	OutLocal = FIntVector(
		GX - OutChunk.X * CS,
		GY - OutChunk.Y * CS,
		GZ - OutChunk.Z * CS);
}

bool AVoxelWorld::EditBlockAtWorld(const FVector& WorldPos, EVoxelBlock NewBlock)
{
	FIntVector CoordChunk, Local;
	WorldToChunkLocal(WorldPos, CoordChunk, Local);

	if (TObjectPtr<AVoxelChunk>* Found = Chunks.Find(CoordChunk))
	{
		(*Found)->SetBlockLocal(Local.X, Local.Y, Local.Z, NewBlock, /*bRemesh=*/true);
		// TODO: ако редакцията е на граница на chunk, пре-mesh-ни и съседния chunk
		// (cross-chunk culling), за да не остане дупка/двойно лице.
		return true;
	}
	return false;
}
