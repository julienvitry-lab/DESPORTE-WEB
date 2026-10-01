# CGWEB121 FIX8 FIX8

Modules :

- SINGLE_FIT_REPLACEMENT001
- DELETE_OLD_FIT_AFTER_VALIDATE001
- CURRENT_FIT_ONLY001

## Nouveau principe

Pour l'éditeur FIT, SPORT Web abandonne l'empilement de versions comme
comportement final.

Lorsqu'une modification est validée :

1. le nouveau FIT est construit ;
2. sa structure et son heure cible sont validées ;
3. le nouveau FIT devient actif ;
4. seulement ensuite, les anciens FIT liés à cette activité sont supprimés
   du coffre SPORT Web ;
5. le nouveau FIT est normalisé comme unique FIT courant ;
6. le manifeste de l'activité pointe sur ce seul FIT.

## Sécurité

La suppression intervient APRES création et validation du nouveau FIT.

Si la création ou la validation échoue, aucun ancien FIT n'est supprimé.

Si un objet ancien ne peut pas être supprimé, il reste référencé et
`fit_replacement_cleanup_ok` devient faux : le frontend refuse alors
d'annoncer un succès complet.

## Conséquence

Après remplacement réussi, une activité ne possède plus plusieurs candidats
FIT dans le coffre :

- un seul document activity_files ;
- un seul objet FIT courant ;
- un seul SHA actif ;
- un seul nom de fichier cohérent avec l'heure cible.

Base :

d92827446db2db4518acf070c287c97c45dd2b35
