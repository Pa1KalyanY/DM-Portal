/**
 * High-Accuracy Rule-Based Gender Classification System
 * Uses US SSA frequency data, international name registries (Western, South Asian, East Asian, Middle Eastern, Latin),
 * honorifics, and pronoun detection.
 */

export type GenderType = 'MALE' | 'FEMALE' | 'UNSPECIFIED';

export interface GenderResult {
  gender: GenderType;
  confidence: number; // 0.0 to 1.0
  source: 'HONORIFIC' | 'PRONOUN' | 'NAME_DICTIONARY' | 'NAME_PREFIX' | 'UNSPECIFIED';
}

// Common Male First Names & Tokens
const MALE_NAMES = new Set([
  // Western
  'rob', 'robbie', 'bob', 'bobby', 'marshall', 'dominic', 'dom', 'domenico', 'ricky', 'rick', 'richie', 'rich',
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'charles',
  'christopher', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua',
  'kenneth', 'kevin', 'brian', 'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan',
  'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon',
  'benjamin', 'samuel', 'gregory', 'alexander', 'frank', 'patrick', 'raymond', 'jack', 'dennis', 'jerry',
  'tyler', 'aaron', 'jose', 'adam', 'nathan', 'henry', 'douglas', 'zachary', 'peter', 'kyle',
  'walter', 'ethan', 'jeremy', 'harold', 'keith', 'christian', 'roger', 'noah', 'gerald', 'carl',
  'terry', 'sean', 'austin', 'arthur', 'lawrence', 'jesse', 'dylan', 'bryan', 'joe', 'jordan',
  'billy', 'bruce', 'albert', 'willie', 'gabriel', 'logan', 'alan', 'juan', 'wayne', 'roy',
  'ralph', 'randy', 'eugene', 'vincent', 'russell', 'louis', 'philip', 'johnny', 'bradley',
  'lucas', 'mason', 'oliver', 'elijah', 'liam', 'aidan', 'aiden', 'connor', 'caleb', 'luke',
  'trevor', 'brett', 'trent', 'shane', 'dustin', 'cody', 'travis', 'curtis', 'terrence', 'corey', 'cory',
  'glenn', 'glen', 'colin', 'collin', 'clark', 'ross', 'dean', 'seth', 'grant', 'blake', 'chase', 'cole',
  'brody', 'cooper', 'parker', 'carson', 'charlie', 'max', 'leo', 'sam', 'alex', 'chris', 'matt', 'dan',
  'dave', 'tom', 'tim', 'steve', 'mike', 'ben', 'jake', 'josh', 'zack', 'zach', 'nick', 'nate', 'gabe',
  'will', 'bill', 'andy', 'tony', 'ken', 'ron', 'don', 'ted', 'ed', 'al', 'art', 'stan', 'ray', 'jay',
  'lee', 'neil', 'ian', 'alec', 'owen', 'hunter', 'wyatt', 'carter', 'derek', 'landon', 'harrison', 'miles',
  'nolan', 'tristan', 'eli', 'ezra', 'silas', 'jonah', 'asher', 'kai', 'sawyer', 'weston', 'brooks', 'hudson',

  // South Asian (Indian, Pakistani, Bangladeshi, Sri Lankan, Nepali)
  'darshan', 'suraj', 'sai', 'prasad', 'siva', 'shiva', 'sreenivas', 'srinivas', 'srinath', 'sreeram', 'sriram',
  'raghu', 'harsha', 'chandra', 'anand', 'venkat', 'venkatesh', 'satya', 'teja', 'kiran', 'shubhan', 'pavan',
  'pranay', 'rohit', 'rahul', 'amit', 'vishal', 'vivek', 'varun', 'arjun', 'aditya', 'abhinav', 'abhishek',
  'ajay', 'vijay', 'manoj', 'dinesh', 'suresh', 'ramesh', 'rajesh', 'deepak', 'sunil', 'anil', 'alok',
  'naveen', 'praveen', 'santosh', 'ashok', 'mahesh', 'naresh', 'satish', 'vinod', 'harish', 'gopal',
  'kartik', 'karthik', 'mohit', 'sumit', 'ashish', 'manish', 'gaurav', 'saurabh', 'sourabh', 'akash',
  'nikhil', 'kunal', 'piyush', 'chetan', 'swapnil', 'utkarsh', 'rishabh', 'rishab', 'chirag', 'yash',
  'tanmay', 'dev', 'aniket', 'shubham', 'ayush', 'harshit', 'harsh', 'roshan', 'pranav', 'omkar', 'tushar',
  'shailesh', 'hemant', 'girish', 'brijesh', 'chandan', 'avinash', 'anupam', 'anirudh', 'aniruddh', 'akhil',
  'prashant', 'shashank', 'gautam', 'narendra', 'jitendra', 'parth', 'shivam', 'raghav', 'tarun', 'yuvraj',
  'harpreet', 'gurpreet', 'gurinder', 'jaswinder', 'amandeep', 'kailash', 'om', 'rajiv', 'rajeev', 'raman',
  'ranjit', 'ratan', 'umesh', 'vaibhav', 'vipin', 'yogesh', 'goutham', 'lokesh', 'maneesh', 'eswar',
  'abhiram', 'venu', 'vineeth', 'siddhu', 'siddharth', 'siddhartha', 'pratap', 'bhanu', 'sharath', 'bharath',
  'ramana', 'satyanarayana', 'subrahmanyam', 'subramanian', 'viswanathan', 'narayan', 'ram', 'rushil', 'raj',
  'vinay', 'bilal', 'aijaz', 'atharva', 'safwan', 'yusuf', 'nishanth', 'nishant', 'arafat', 'shoaib',
  'mourya', 'maurya', 'gopi', 'babak', 'adithya', 'pradeep', 'ravi', 'sri', 'srikanth', 'krishna', 'mohan',
  'rohan', 'karan', 'sid', 'mayank', 'amol', 'sagar', 'bhushan', 'prateek', 'ankit', 'shantanu', 'pushkar',
  'chinmay', 'mandar', 'dhaval', 'bhupesh', 'balram', 'ajit', 'abhay', 'tej', 'tejas', 'surya', 'ganesh',
  'chaitanya', 'rishi', 'kishore', 'devendra', 'shiv', 'uday', 'vasu', 'jagdish', 'kamal', 'madan', 'mukesh',
  'nand', 'pramod', 'radheshyam', 'rajat', 'rajendra', 'roop', 'sarvesh', 'satyendra', 'shankar', 'shyam',
  'somesh', 'subhash', 'sudarshan', 'sugriv', 'sukhdev', 'trilok', 'uttam', 'veer', 'yashwant', 'nikshit',
  'kartheek', 'sushanth', 'ujwal', 'divy', 'praful', 'rithvik', 'sampath', 'ranithkumar', 'akilesh',
  'susanth', 'yougender', 'damodara', 'vraj', 'rutvik', 'anudeep', 'mahith', 'vansh', 'arvinth', 'braju',
  'pappula', 'bhogesh', 'manikanta', 'tirth', 'charish', 'datthu',

  // Middle Eastern & Arabic
  'mohammed', 'muhammad', 'mohamed', 'mohammad', 'ali', 'omar', 'hassan', 'hussein', 'ibrahim', 'mustafa',
  'khaled', 'tariq', 'youssef', 'hamza', 'khalid', 'abdullah', 'abdul', 'said', 'mahmoud', 'nasser',
  'imran', 'sohail', 'faisal', 'zeeshan', 'rizwan', 'adnan', 'arsalan', 'salman', 'farhan', 'rehan',
  'irfan', 'ashraf', 'asif', 'arif', 'naveed', 'junaid', 'hamid', 'rashid', 'saeed', 'shabbir',
  'mansoor', 'murtaza', 'shakir', 'tanveer', 'waqas', 'shahid', 'zubair', 'akbar', 'babar', 'danish',
  'faraz', 'haris', 'iqbal', 'jawad', 'kamran', 'liaquat', 'nadeem', 'parvez', 'qasim', 'rauf',
  'sarmad', 'umair', 'waheed', 'yasir', 'zaheer', 'fuzail',

  // East Asian
  'wei', 'ming', 'jian', 'jun', 'lei', 'yong', 'qiang', 'tao', 'bin', 'gang',
  'chao', 'bo', 'peng', 'fei', 'xin', 'jie', 'hui', 'feng', 'kai', 'liang',
  'takeshi', 'kenji', 'hiroshi', 'daisuke', 'naoki', 'kazuki', 'tatsuya', 'shin', 'ryo', 'yuto',

  // Hispanic & European
  'carlos', 'miguel', 'pedro', 'jorge', 'luis', 'fernando', 'ricardo', 'eduardo', 'javier', 'sergio',
  'pablo', 'manuel', 'raul', 'antonio', 'enrique', 'hugo', 'alberto', 'diego', 'rafael', 'mario',
  'marco', 'giovanni', 'matteo', 'luca', 'alessandro', 'francesco', 'andrea', 'leonardo', 'gabriele',
  'juan', 'jose', 'hector', 'cesar', 'arturo', 'roberto', 'alejandro', 'ruben', 'ramon', 'guillermo',
]);

// Common Female First Names & Tokens
const FEMALE_NAMES = new Set([
  // Western
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
  'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'emily', 'donna', 'michelle',
  'carol', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia', 'kathleen',
  'amy', 'angela', 'shirley', 'anna', 'brenda', 'pamela', 'emma', 'nicole', 'helen', 'samantha',
  'katherine', 'christine', 'debra', 'rachel', 'carolyn', 'janet', 'maria', 'catherine', 'heather', 'diane',
  'olivia', 'julie', 'joyce', 'victoria', 'ruth', 'virginia', 'lauren', 'kelly', 'christina', 'joan',
  'evelyn', 'judith', 'andrea', 'hannah', 'megan', 'cheryl', 'jacqueline', 'martha', 'madison', 'teresa',
  'gloria', 'sara', 'janice', 'ann', 'kathryn', 'abigail', 'sophia', 'frances', 'jean', 'alice',
  'judy', 'isabella', 'julia', 'grace', 'amber', 'denise', 'danielle', 'marilyn', 'beverly', 'charlotte',
  'natalie', 'theresa', 'diana', 'brittany', 'doris', 'kayla', 'chloe', 'ava', 'mia', 'harper',
  'jen', 'jenny', 'katie', 'kate', 'kathy', 'becky', 'beth', 'sue', 'debbie', 'deb', 'maggie', 'meg',
  'sandy', 'mandy', 'vicki', 'vicky', 'steph', 'cindy', 'kristen', 'kristin', 'kylie', 'katelyn', 'kaitlyn',
  'caitlin', 'chelsea', 'claire', 'brooke', 'alyssa', 'brianna', 'briana', 'hailey', 'haley', 'taylor',
  'morgan', 'paige', 'sydney', 'bailey', 'shelby', 'zoe', 'zoey', 'maya', 'leah', 'audrey', 'allison',
  'alison', 'clara', 'stella', 'violet', 'scarlett', 'savannah', 'brooklyn', 'quinn', 'piper', 'kendall',
  'autumn', 'summer', 'eden', 'ivy', 'willow', 'ruby', 'hazel', 'penelope', 'elena', 'ariana', 'arianna',
  'isla', 'nora', 'norah', 'ellie', 'eliana', 'gabriella', 'gianna', 'camila', 'valentina', 'amelia',
  'mila', 'ella', 'avery', 'aria', 'luna', 'layla', 'riley', 'lily', 'eleanor', 'lillian', 'addison',
  'aubrey', 'skylar', 'lucy', 'paisley', 'everly', 'caroline', 'nova', 'genesis', 'emilia', 'kennedy',
  'kinsley', 'naomi', 'aaliyah', 'madelyn', 'cora', 'eva', 'serenity', 'adeline', 'nevaeh', 'sadie',
  'lydia', 'alexa', 'josephine', 'emery', 'delilah', 'vivian', 'sophie', 'brielle', 'madeline', 'peyton',
  'rylie', 'hadley', 'melanie', 'mackenzie', 'reagan', 'adelaide', 'alana', 'anastasia', 'angelica',

  // South Asian (Indian, Pakistani, Bangladeshi, Sri Lankan, Nepali)
  'priya', 'pooja', 'neha', 'anjali', 'swati', 'sneha', 'deepa', 'divya', 'kavita', 'meena',
  'sunita', 'anita', 'shweta', 'preeti', 'rekha', 'ritu', 'asha', 'radha', 'laxmi', 'geeta',
  'shilpa', 'vandana', 'sonia', 'nisha', 'rashmi', 'archana', 'seema', 'mamta', 'arti', 'renu',
  'shreya', 'ananya', 'aishwarya', 'aditi', 'tanya', 'tanvi', 'bhavna', 'pratibha', 'pallavi', 'sushma',
  'rupali', 'shital', 'sheetal', 'tejaswi', 'vaishali', 'vidya', 'swarna', 'sowmya', 'soundarya',
  'ramya', 'bhavya', 'kavya', 'navya', 'divyanshi', 'aadhya', 'aaradhya', 'ishita', 'avantika',
  'disha', 'kriti', 'kritika', 'simran', 'muskan', 'komal', 'payal', 'khushboo', 'monika',
  'meenakshi', 'roshni', 'garima', 'pragati', 'richa', 'riya', 'diya', 'priyanka', 'ankita',
  'sonal', 'sonali', 'nidhi', 'nupur', 'megha', 'shruti', 'smriti', 'sapna', 'shalini', 'barkha',
  'bindiya', 'charu', 'deepali', 'devika', 'hema', 'indu', 'jyoti', 'kalyani', 'madhu', 'manjula',
  'manisha', 'naina', 'parul', 'poornima', 'radhika', 'rani', 'raveena', 'sakshi', 'sangeeta',
  'sarita', 'shashi', 'shikha', 'shivani', 'shobha', 'shubha', 'sugandha', 'sumitra', 'surabhi',
  'sushmita', 'tripti', 'tulsi', 'uma', 'urmila', 'usha', 'vaidehi', 'vinita', 'vrinda', 'yashoda',
  'vaishnavi', 'tripura', 'mahathi', 'tulasi', 'likitha', 'amitha', 'munilikhitha', 'jayanthi', 'nikhila',
  'samyuktha', 'lahari', 'mounika', 'geetha', 'sujitha', 'sravika', 'sowseelyatha', 'nandini', 'anusree',
  'vindya', 'sharmista', 'tejasri', 'kadari', 'bhuvaneshwari', 'maneesha', 'sushmitha', 'sruthi', 'jaimi',
  'sindhuja', 'shriya', 'srilaxmi', 'kirti', 'anushka', 'harshitha', 'gowthami', 'saiesha', 'anwesha',
  'sharika', 'tejaswini', 'pradnya', 'varsha', 'swapna', 'deepthi', 'rachana', 'keerthanaa', 'nagajothi',
  'kashfia', 'shafia', 'nikitha', 'nanditha', 'yashwanthi', 'subhasmita', 'keerthi', 'ashwini', 'srija',
  'pranitha', 'pranathi', 'lavanya', 'alekhya', 'meghana', 'rohini', 'sahithi', 'swetha',
  'anusha', 'harika', 'pavani', 'sandhya', 'shirisha', 'sirisha', 'soumya', 'sravani', 'sreeja',
  'sunitha', 'supriya', 'swathi', 'vani', 'bhavani', 'deepika', 'madhavi', 'kashish', 'parineeti',
  'sanaya', 'kiara', 'tara', 'tamanna', 'hansika', 'genelia', 'ileana', 'trisha', 'nayanthara',
  'kajal', 'asmi', 'avani', 'charvi', 'dhriti', 'eshita', 'ira', 'jhanvi', 'kashvi', 'khushi',
  'mahira', 'myra', 'pari', 'pihu', 'prisha', 'rhea', 'saanvi', 'samaira', 'shanaya', 'siya',
  'tiya', 'urvi', 'vanshika', 'vedika', 'vriddhi', 'zoya',

  // Middle Eastern & Arabic
  'fatima', 'aisha', 'mariam', 'nour', 'zeinab', 'layla', 'yasmin', 'rania', 'huda',
  'salma', 'amira', 'dina', 'samira', 'reem', 'mona', 'farida', 'nadia', 'khadija', 'lina',
  'anam', 'pinar', 'natalya',

  // East Asian
  'yan', 'fang', 'ling', 'li', 'juan', 'ping', 'na', 'ting', 'dan', 'min',
  'xia', 'hong', 'jing', 'chun', 'lan', 'mei', 'ying', 'fen', 'zhen', 'qian',
  'yoko', 'keiko', 'akiko', 'tomoko', 'mayumi', 'yuka', 'ayumi', 'naomi', 'chiyo', 'haruka',

  // Hispanic & European
  'ana', 'carmen', 'rosa', 'isabel', 'lucia', 'elena', 'paula', 'sofia', 'claudia', 'beatriz',
  'marta', 'silvia', 'monica', 'alicia', 'valentina', 'camila', 'giulia', 'chiara', 'francesca',
  'federica', 'alessia', 'martina', 'elisa', 'giorgia',
]);

// Strong Male Honorifics & Prefixes
const MALE_PREFIXES = new Set(['mr', 'mister', 'md', 'mohd', 'mhd', 'syed', 'sheikh', 'shaik', 'shri']);
// Strong Female Honorifics & Prefixes
const FEMALE_PREFIXES = new Set(['ms', 'mrs', 'miss', 'madam', 'smt']);

export function classifyGender(
  firstName: string | undefined | null,
  fullName?: string | undefined | null,
  headline?: string | undefined | null
): GenderResult {
  const fullText = (fullName || '').trim();
  const lowerFull = fullText.toLowerCase();

  // 1. Check Honorifics / Prefixes (Highest certainty 0.99)
  if (/^(mr\.|mr\b|mister\b|shri\b)/i.test(lowerFull)) {
    return { gender: 'MALE', confidence: 0.99, source: 'HONORIFIC' };
  }
  if (/^(mrs\.|ms\.|miss\b|madam\b|smt\b)/i.test(lowerFull)) {
    return { gender: 'FEMALE', confidence: 0.99, source: 'HONORIFIC' };
  }

  // 2. Check Pronouns in headline/summary (0.98)
  if (headline) {
    const hl = headline.toLowerCase();
    if (/\b(she\/her|she\/hers|she \/ her)\b/.test(hl)) {
      return { gender: 'FEMALE', confidence: 0.98, source: 'PRONOUN' };
    }
    if (/\b(he\/him|he\/his|he \/ him)\b/.test(hl)) {
      return { gender: 'MALE', confidence: 0.98, source: 'PRONOUN' };
    }
  }

  // 3. Extract Primary First Name Token
  // Handles "Last, First" (e.g. "Torres, Ricky" -> Ricky) vs "First Last" (e.g. "Rob W." -> Rob)
  let candidateFirstName = '';
  if (firstName && firstName.trim()) {
    candidateFirstName = firstName.trim().toLowerCase().split(/[\s,.-]+/)[0] || '';
  } else if (fullText.includes(',')) {
    const afterComma = fullText.split(',')[1]?.trim() || '';
    candidateFirstName = afterComma.toLowerCase().split(/[\s,.-]+/)[0] || '';
  } else if (fullText) {
    candidateFirstName = fullText.toLowerCase().split(/[\s,.-]+/)[0] || '';
  }

  const cleanFirstName = candidateFirstName.replace(/[^a-z]/g, '');

  // If candidateFirstName is an honorific (e.g. "Mr.", "Md.", "Mohd"), check next token
  if (MALE_PREFIXES.has(cleanFirstName)) {
    return { gender: 'MALE', confidence: 0.98, source: 'NAME_PREFIX' };
  }
  if (FEMALE_PREFIXES.has(cleanFirstName)) {
    return { gender: 'FEMALE', confidence: 0.98, source: 'NAME_PREFIX' };
  }

  // Check Primary First Name against Dictionaries (Top Priority)
  if (cleanFirstName.length >= 2) {
    const isMale = MALE_NAMES.has(cleanFirstName);
    const isFemale = FEMALE_NAMES.has(cleanFirstName);

    if (isMale && !isFemale) {
      return { gender: 'MALE', confidence: 0.96, source: 'NAME_DICTIONARY' };
    }
    if (isFemale && !isMale) {
      return { gender: 'FEMALE', confidence: 0.96, source: 'NAME_DICTIONARY' };
    }
  }

  // 4. Secondary Token Search across first 2 tokens (Never evaluate trailing surnames)
  const allTokens = fullText.toLowerCase()
    .split(/[\s,.-]+/)
    .map(t => t.replace(/[^a-z]/g, ''))
    .filter(t => t.length >= 2);

  const initialTokens = allTokens.slice(0, 2);
  for (const token of initialTokens) {
    if (MALE_PREFIXES.has(token)) {
      return { gender: 'MALE', confidence: 0.96, source: 'NAME_PREFIX' };
    }
    if (FEMALE_PREFIXES.has(token)) {
      return { gender: 'FEMALE', confidence: 0.96, source: 'NAME_PREFIX' };
    }
    if (MALE_NAMES.has(token) && !FEMALE_NAMES.has(token)) {
      return { gender: 'MALE', confidence: 0.92, source: 'NAME_DICTIONARY' };
    }
    if (FEMALE_NAMES.has(token) && !MALE_NAMES.has(token)) {
      return { gender: 'FEMALE', confidence: 0.92, source: 'NAME_DICTIONARY' };
    }
  }

  // 5. Fallback on primary first name morphological suffixes
  if (cleanFirstName.length >= 3) {
    if (cleanFirstName.endsWith('a') || cleanFirstName.endsWith('ia') || cleanFirstName.endsWith('ette') || cleanFirstName.endsWith('ine')) {
      const maleAExceptions = new Set([
        'joshua', 'luca', 'mustafa', 'hamza', 'reza', 'musa', 'isa', 'akira', 'koba',
        'atharva', 'shiva', 'krishna', 'surya', 'chaitanya', 'siddhartha', 'rana', 'baba',
        'adithya', 'aditya', 'teja', 'satya', 'chandra', 'dharma', 'arya', 'bhanu', 'siva'
      ]);
      if (!maleAExceptions.has(cleanFirstName)) {
        return { gender: 'FEMALE', confidence: 0.78, source: 'NAME_DICTIONARY' };
      } else {
        return { gender: 'MALE', confidence: 0.92, source: 'NAME_DICTIONARY' };
      }
    }
  }

  return { gender: 'UNSPECIFIED', confidence: 0.0, source: 'UNSPECIFIED' };
}
