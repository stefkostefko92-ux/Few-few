"GameInfo"
{

	game 		"Counter-Strike 2"
	title 		"Counter-Strike 2"
	title_pw	"E58F8DE68190E7B2BEE88BB1EFBC9AE585A8E79083E694BBE58ABF"
	
	SatelliteDir	csgo_gc

	FileSystem
	{
		SteamAppId				710			// This will mount all the GCFs we need (240=CS:S, 220=HL2).
		SearchPaths
		{
			Game_LowViolence	csgo_lv // Perfect World content override

			Game	csgo
			Game	core

			Mod		csgo

			AddonRoot			csgo_addons
			OfficialAddonRoot	csgo_community_addons
		}

		"UserSettingsPathID"	"USRLOCAL"
}
