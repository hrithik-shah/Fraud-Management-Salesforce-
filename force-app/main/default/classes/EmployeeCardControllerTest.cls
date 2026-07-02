@isTest
private class EmployeeCardControllerTest {

    @testSetup
    static void setupData() {
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        List<Card__c> cards = new List<Card__c>{
            new Card__c(Name = 'Card Active 1', Status__c = 'Active', Account__c = acc.Id, Expiration_Date__c = Date.today().addYears(2), Cardholder_Name__c = 'Test User 1', Card_Number_Last_4__c = 1111, Customer_ID__c = 'CUST-E1'),
            new Card__c(Name = 'Card Active 2', Status__c = 'Active', Account__c = acc.Id, Expiration_Date__c = Date.today().addYears(2), Cardholder_Name__c = 'Test User 2', Card_Number_Last_4__c = 2222, Customer_ID__c = 'CUST-E2'),
            new Card__c(Name = 'Card Active 3', Status__c = 'Active', Account__c = acc.Id, Expiration_Date__c = Date.today().addYears(2), Cardholder_Name__c = 'Test User 3', Card_Number_Last_4__c = 3333, Customer_ID__c = 'CUST-E3')
        };
        insert cards;
    }

    @isTest
    static void testGetCardsFlaggedMode() {
        Test.startTest();
        List<Card__c> flaggedCards = EmployeeCardController.getCards('Flagged');
        Test.stopTest();

        System.assertEquals(0, flaggedCards.size());
    }

    @isTest
    static void testGetCardsAllMode() {
        Test.startTest();
        List<Card__c> allCards = EmployeeCardController.getCards('All');
        Test.stopTest();

        System.assertEquals(3, allCards.size());
    }
}