# WEB055-FIX8-FIX4 · EQUIPPROFILE005

Architecture additive : WEB053 reste intact.

Profils simples ajoutés :
1. VELO → VELO 1
2. VTT → VELO 2
3. HOME TRAINER → VELO 3
4. COURSE A PIED → CHAUSSURES 1
5. TRAIL → CHAUSSURES 2
6. KINOMAP → CHAUSSURES 3

Les listes sont alimentées depuis les matériels actifs de SPORT Web :
- VELO / VTT : BIKE ;
- HOME TRAINER : BIKE + HOME_TRAINER ;
- COURSE / TRAIL / KINOMAP : SHOES.

Signatures confirmées avec les fichiers fournis :
- VELO : sport 2 / sub_sport 0 ;
- VTT : sport 2 / sub_sport 8 ;
- COURSE : sport 1 / sub_sport 0 ;
- TRAIL : sport 1 / sub_sport 3 ;
- KINOMAP : running / KinomapVirtualRun, compatibilité VirtualRun 21.

HOME TRAINER reste configurable mais n'est pas appliqué automatiquement
tant que sa signature technique n'est pas confirmée.

Les choix manuels equipment_manual=1 sont toujours préservés.
