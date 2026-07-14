@isTest
private class PartnerDashboardControllerTest {

    @testSetup
    static void setupData() {
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        Contact customer = new Contact(LastName = 'Dash User', Customer_ID__c = 'CUST-DB');
        insert customer;

        Card__c card = new Card__c(
            Name = 'Dashboard Test Card', 
            Expiration_Date__c = Date.today().addYears(2), 
            Cardholder_Name__c = 'Dash User', 
            Card_Number_Last_4__c = 5555, 
            Customer_Contact__c = customer.Id,
            Status__c = 'Active'
        );
        insert card;

        List<Transaction__c> txns = new List<Transaction__c>{
            new Transaction__c(Card__c = card.Id, Amount__c = 500, Status__c = 'Approved', Transaction_Date__c = System.today(), Store_Location__c = 'Location A', Product_Code__c = 'PROD1', Partner_Account__c = acc.Id, Transaction_ID__c = 'TXN-DB-1'),
            new Transaction__c(Card__c = card.Id, Amount__c = 300, Status__c = 'Approved', Transaction_Date__c = System.today().addMonths(-1), Store_Location__c = 'Location A', Product_Code__c = 'PROD1', Partner_Account__c = acc.Id, Transaction_ID__c = 'TXN-DB-2'),
            new Transaction__c(Card__c = card.Id, Amount__c = 150, Status__c = 'Fraudulent', Transaction_Date__c = System.today().addMonths(-1), Store_Location__c = 'Location B', Product_Code__c = 'PROD2', Partner_Account__c = acc.Id, Transaction_ID__c = 'TXN-DB-3'),
            new Transaction__c(Card__c = card.Id, Amount__c = 50, Status__c = 'Cancelled', Transaction_Date__c = System.today().addMonths(-1), Store_Location__c = 'Location A', Product_Code__c = 'PROD1', Partner_Account__c = acc.Id, Transaction_ID__c = 'TXN-DB-4'),
            new Transaction__c(Card__c = card.Id, Amount__c = 200, Status__c = 'Pending', Transaction_Date__c = System.today(), Store_Location__c = 'Location B', Product_Code__c = 'PROD2', Partner_Account__c = acc.Id, Transaction_ID__c = 'TXN-DB-5')
        };
        insert txns;
    }

    @isTest
    static void testGetDashboardMetrics() {
        Test.startTest();
        Map<String, Object> metrics = PartnerDashboardController.getDashboardMetrics();
        Test.stopTest();

        System.assertNotEquals(null, metrics);
        System.assert((Decimal)metrics.get('currMonthRevenue') >= 0);
        System.assert((Decimal)metrics.get('lastMonthRevenue') >= 0);
        System.assert((Decimal)metrics.get('revenueLost') >= 0); 
        System.assert((Integer)metrics.get('pendingCount') >= 0);
        System.assert((Integer)metrics.get('fraudCount') >= 0);
        System.assert((Integer)metrics.get('cancelCount') >= 0);
        System.assert((Decimal)metrics.get('avgTransactionValue') >= 0); 
        
        List<Map<String, Object>> topStores = (List<Map<String, Object>>)metrics.get('topStores');
        System.assertNotEquals(null, topStores);
        
        List<Map<String, Object>> topProducts = (List<Map<String, Object>>)metrics.get('topProducts');
        System.assertNotEquals(null, topProducts);
    }
}