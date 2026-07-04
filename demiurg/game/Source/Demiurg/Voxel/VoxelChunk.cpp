#include "VoxelChunk.h"
#include "ProceduralMeshComponent.h"

namespace
{
	/** Цвят на блока за vertex-color рендер (spike — без текстури). */
	FColor BlockColor(EVoxelBlock B)
	{
		switch (B)
		{
		case EVoxelBlock::Stone:  return FColor(120, 120, 128);
		case EVoxelBlock::Dirt:   return FColor(110, 78, 50);
		case EVoxelBlock::Grass:  return FColor(78, 120, 54);
		case EVoxelBlock::Sand:   return FColor(214, 196, 140);
		case EVoxelBlock::Wood:   return FColor(120, 82, 45);
		case EVoxelBlock::Bamboo: return FColor(150, 180, 90);
		case EVoxelBlock::Leaves: return FColor(60, 110, 60);
		case EVoxelBlock::Water:  return FColor(60, 110, 160);
		default:                  return FColor::White;
		}
	}
}

AVoxelChunk::AVoxelChunk()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("VoxelMesh"));
	SetRootComponent(Mesh);
	Mesh->bUseAsyncCooking = true;
	Mesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	Mesh->SetCastShadow(true);
}

void AVoxelChunk::Initialize(const FIntVector& InChunkCoord, int32 InSeed)
{
	ChunkCoord = InChunkCoord;
	Seed = InSeed;

	SetActorLocation(FVector(
		ChunkCoord.X * Voxel::ChunkSize * Voxel::BlockSize,
		ChunkCoord.Y * Voxel::ChunkSize * Voxel::BlockSize,
		ChunkCoord.Z * Voxel::ChunkSize * Voxel::BlockSize));

	GenerateBlocks();
	RebuildMesh();
}

EVoxelBlock AVoxelChunk::GetBlockLocal(int32 X, int32 Y, int32 Z) const
{
	if (X < 0 || X >= Voxel::ChunkSize || Y < 0 || Y >= Voxel::ChunkSize || Z < 0 || Z >= Voxel::ChunkSize)
	{
		return EVoxelBlock::Air;
	}
	return static_cast<EVoxelBlock>(Blocks[BlockIndex(X, Y, Z)]);
}

void AVoxelChunk::SetBlockLocal(int32 X, int32 Y, int32 Z, EVoxelBlock Block, bool bRemesh)
{
	if (X < 0 || X >= Voxel::ChunkSize || Y < 0 || Y >= Voxel::ChunkSize || Z < 0 || Z >= Voxel::ChunkSize)
	{
		return;
	}
	Blocks[BlockIndex(X, Y, Z)] = static_cast<uint8>(Block);
	if (bRemesh)
	{
		RebuildMesh();
	}
}

bool AVoxelChunk::IsSolidLocal(int32 X, int32 Y, int32 Z) const
{
	if (X < 0 || X >= Voxel::ChunkSize || Y < 0 || Y >= Voxel::ChunkSize || Z < 0 || Z >= Voxel::ChunkSize)
	{
		return false; // извън chunk-а третираме като въздух (spike; cross-chunk culling — по-късно)
	}
	return Blocks[BlockIndex(X, Y, Z)] != static_cast<uint8>(EVoxelBlock::Air);
}

void AVoxelChunk::GenerateBlocks()
{
	Blocks.SetNumZeroed(Voxel::ChunkSize * Voxel::ChunkSize * Voxel::ChunkSize);

	const int32 BaseX = ChunkCoord.X * Voxel::ChunkSize;
	const int32 BaseY = ChunkCoord.Y * Voxel::ChunkSize;
	const int32 BaseZ = ChunkCoord.Z * Voxel::ChunkSize;

	for (int32 X = 0; X < Voxel::ChunkSize; ++X)
	{
		for (int32 Y = 0; Y < Voxel::ChunkSize; ++Y)
		{
			const float WX = static_cast<float>(BaseX + X);
			const float WY = static_cast<float>(BaseY + Y);

			// Placeholder layered-sine heightmap. Заменя се с PCG / Perlin биом
			// (японска долина: оризови тераси, планини) — виж docs/07 §3 (седмица 5).
			const float H =
				16.0f
				+ 6.0f * FMath::Sin(WX * 0.06f) * FMath::Cos(WY * 0.06f)
				+ 3.0f * FMath::Sin(WX * 0.13f + WY * 0.09f);

			const int32 Height = FMath::Clamp(FMath::RoundToInt(H), 1, Voxel::ChunkSize - 1);

			for (int32 Z = 0; Z < Voxel::ChunkSize; ++Z)
			{
				const int32 WorldZ = BaseZ + Z; // spike: очаква единичен вертикален слой (ChunkCoord.Z == 0)

				EVoxelBlock B = EVoxelBlock::Air;
				if (WorldZ < Height - 3)      B = EVoxelBlock::Stone;
				else if (WorldZ < Height - 1) B = EVoxelBlock::Dirt;
				else if (WorldZ < Height)     B = EVoxelBlock::Grass;

				Blocks[BlockIndex(X, Y, Z)] = static_cast<uint8>(B);
			}
		}
	}
}

void AVoxelChunk::RebuildMesh()
{
	TArray<FVector> Vertices;
	TArray<int32> Triangles;
	TArray<FVector> Normals;
	TArray<FVector2D> UVs;
	TArray<FColor> Colors;
	TArray<FProcMeshTangent> Tangents;

	const float S = Voxel::BlockSize;

	// 6 лица. Нормали + 4 ъгъла (в единичен куб 0..1) + посока на съседа за culling.
	static const FVector FaceNormals[6] = {
		FVector( 1, 0, 0), FVector(-1, 0, 0),
		FVector( 0, 1, 0), FVector( 0,-1, 0),
		FVector( 0, 0, 1), FVector( 0, 0,-1)
	};
	static const FIntVector FaceDir[6] = {
		FIntVector( 1, 0, 0), FIntVector(-1, 0, 0),
		FIntVector( 0, 1, 0), FIntVector( 0,-1, 0),
		FIntVector( 0, 0, 1), FIntVector( 0, 0,-1)
	};
	static const FVector FaceVerts[6][4] = {
		// +X
		{ FVector(1,0,0), FVector(1,1,0), FVector(1,1,1), FVector(1,0,1) },
		// -X
		{ FVector(0,1,0), FVector(0,0,0), FVector(0,0,1), FVector(0,1,1) },
		// +Y
		{ FVector(1,1,0), FVector(0,1,0), FVector(0,1,1), FVector(1,1,1) },
		// -Y
		{ FVector(0,0,0), FVector(1,0,0), FVector(1,0,1), FVector(0,0,1) },
		// +Z
		{ FVector(0,0,1), FVector(1,0,1), FVector(1,1,1), FVector(0,1,1) },
		// -Z
		{ FVector(0,1,0), FVector(1,1,0), FVector(1,0,0), FVector(0,0,0) }
	};

	for (int32 Z = 0; Z < Voxel::ChunkSize; ++Z)
	{
		for (int32 Y = 0; Y < Voxel::ChunkSize; ++Y)
		{
			for (int32 X = 0; X < Voxel::ChunkSize; ++X)
			{
				if (!IsSolidLocal(X, Y, Z))
				{
					continue;
				}
				const FColor Col = BlockColor(GetBlockLocal(X, Y, Z));

				for (int32 f = 0; f < 6; ++f)
				{
					const FIntVector N = FaceDir[f];
					if (IsSolidLocal(X + N.X, Y + N.Y, Z + N.Z))
					{
						continue; // съседът е плътен → лицето е скрито → culling
					}

					const int32 Base = Vertices.Num();
					for (int32 c = 0; c < 4; ++c)
					{
						Vertices.Add((FVector(X, Y, Z) + FaceVerts[f][c]) * S);
						Normals.Add(FaceNormals[f]);
						Colors.Add(Col);
						Tangents.Add(FProcMeshTangent(1, 0, 0));
					}
					UVs.Add(FVector2D(0, 0));
					UVs.Add(FVector2D(1, 0));
					UVs.Add(FVector2D(1, 1));
					UVs.Add(FVector2D(0, 1));

					// ЗАБЕЛЕЖКА: ако лицата се рендерират наопаки (виждаш през тях),
					// обърни реда на триъгълниците (0,2,1 / 0,3,2) — провери в редактора.
					Triangles.Add(Base + 0);
					Triangles.Add(Base + 1);
					Triangles.Add(Base + 2);
					Triangles.Add(Base + 0);
					Triangles.Add(Base + 2);
					Triangles.Add(Base + 3);
				}
			}
		}
	}

	Mesh->ClearAllMeshSections();
	Mesh->CreateMeshSection(0, Vertices, Triangles, Normals, UVs, Colors, Tangents, /*bCreateCollision=*/true);
	if (Material)
	{
		Mesh->SetMaterial(0, Material);
	}

	// TODO(оптимизация): greedy meshing — обединявай съседни еднакви лица в по-големи
	// quad-ове (драстично по-малко вертекси). И async re-mesh през Task Graph, за да не
	// блокира game thread при бързо копаене (docs/07 §5).
}
