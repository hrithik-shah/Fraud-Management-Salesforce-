public with sharing class CustomerLookupController {
    
    @AuraEnabled(cacheable=true)
    public static List<String> searchCustomerIds(String searchTerm) {
        List<String> results = new List<String>();
        
        if (String.isBlank(searchTerm) || searchTerm.length() < 2) {
            return results;
        }
        
        String searchKey = '%' + String.escapeSingleQuotes(searchTerm) + '%';
        
        for (AggregateResult ar : [
            SELECT Customer_ID__c 
            FROM Card__c 
            WHERE Customer_ID__c LIKE :searchKey 
            AND Customer_ID__c != null
            GROUP BY Customer_ID__c 
            LIMIT 10
        ]) {
            results.add((String)ar.get('Customer_ID__c'));
        }
        
        return results;
    }
}