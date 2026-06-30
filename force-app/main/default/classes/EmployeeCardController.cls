public with sharing class EmployeeCardController {
    
    @AuraEnabled(cacheable=true)
    public static List<Card__c> getCards(String filterMode) {
        if (filterMode == 'Flagged') {
            return [
                SELECT Id, Name, Status__c, CreatedDate 
                FROM Card__c 
                WHERE Status__c = 'Flagged' 
                ORDER BY CreatedDate DESC
            ];
        } else {
            return [
                SELECT Id, Name, Status__c, CreatedDate 
                FROM Card__c 
                ORDER BY CreatedDate DESC
            ];
        }
    }
}