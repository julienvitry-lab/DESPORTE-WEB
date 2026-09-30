# CGWEB121 FIX8 FIX1

Modules :

- REAL_FIT_REBUILD001
- FIT_FIRST_TIME_SYNC001
- ACTIVITY_FIT_SINGLE_OPERATION001

## Correction fonctionnelle

FIX8 avait introduit un mode permettant de modifier l'heure de l'activité
sans FIT. Ce mode reste disponible comme secours explicite, mais il ne répond
pas au besoin principal : corriger réellement le fichier FIT.

FIX8 FIX1 donne désormais la priorité au FIT réel.

### Aucun FIT associé, activité reconstructible

SPORT Web :

1. vérifie `MISSING_FIT_GENERATE001` ;
2. reconstruit un vrai FIT canonique depuis l'activité via le moteur déjà
   validé CGWEB094C / FITWRITER001 ;
3. associe ce FIT à l'activité ;
4. si l'heure demandée diffère de l'heure actuelle, FITEDITOR001 crée une
   nouvelle version en appliquant le même décalage à tous les timestamps ;
5. la nouvelle version devient ACTIVE et l'activité est synchronisée.

### Activité déjà corrigée dans SPORT Web

Si l'heure SPORT Web a déjà été corrigée par FIX8 et qu'aucun FIT n'existe,
la reconstruction seule suffit : le FIT est généré avec l'heure actuelle
correcte de l'activité.

### FIT source réel retrouvé

La voie FIT_SOURCE_RECOVERY001 de FIX8 reste prioritaire lorsqu'un unique
FIT Cloud non lié peut être identifié : le vrai fichier source est conservé.

### Données insuffisantes

Aucun FIT artificiellement vide n'est créé. Le bouton principal reste
désactivé et le mode `Modifier SPORT Web seulement` demeure un choix
secondaire explicite.

## Sécurité

- aucun FIT existant remplacé ;
- FIT parent reconstruit conservé ;
- aucune association automatique ambiguë ;
- révision SAFEEDIT avant création d'une version modifiée ;
- aucune Functions nouvelle : réutilisation de MISSING_FIT_GENERATE001
  et FITEDITOR001 déjà déployés.

Base :

3f28b3be6c15cb988715820c66eb0059af46654c
