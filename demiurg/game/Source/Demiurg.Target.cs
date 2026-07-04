using UnrealBuildTool;
using System.Collections.Generic;

public class DemiurgTarget : TargetRules
{
	public DemiurgTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("Demiurg");
	}
}
