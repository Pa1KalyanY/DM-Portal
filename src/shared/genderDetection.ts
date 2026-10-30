// Automated Gender Detection & Separation Engine for AaraTech & ClinisolTech
// Detects gender from explicit spreadsheet columns, honorific salutations, multi-token first-name lexicons, and screening notes

import { Gender } from '../types/masterDatabase';

// Curated high-precision first name lexicons (thousands of international and South Asian/Indian names)
const MALE_NAMES = new Set([
  // Popular Western / International
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'charles',
  'christopher', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua',
  'kenneth', 'kevin', 'brian', 'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan',
  'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon',
  'benjamin', 'samuel', 'gregory', 'frank', 'raymond', 'alexander', 'patrick', 'jack', 'dennis', 'jerry',
  'tyler', 'aaron', 'jose', 'adam', 'nathan', 'henry', 'douglas', 'zachary', 'peter', 'kyle',
  'noah', 'ethan', 'jeremy', 'christian', 'walter', 'keith', 'austin', 'roger', 'terry', 'sean',
  'gerald', 'carl', 'harold', 'dylan', 'arthur', 'lawrence', 'bryan', 'billy', 'joe', 'bruce',
  'gabriel', 'logan', 'albert', 'willie', 'alan', 'juan', 'wayne', 'elijah', 'randy', 'roy',
  'vincent', 'ralph', 'eugene', 'russell', 'bobby', 'mason', 'philip', 'louis', 'lucas', 'leo',
  'lucian', 'brent', 'troy', 'ian', 'connor', 'luke', 'marcus', 'colin', 'derek', 'cameron',
  'victor', 'martin', 'craig', 'shawn', 'travis', 'bradley', 'cody', 'edwin', 'grant', 'shane',
  'sanjo', 'george', 'alex', 'antony', 'dominic', 'simon', 'oliver', 'liam', 'owen', 'evan',
  'chase', 'blake', 'corey', 'brett', 'mitchell', 'seth', 'trevor', 'spencer', 'dalton', 'colton',

  // South Asian / Telugu / Tamil / South Indian Tech
  'pavan', 'kalyan', 'sateesh', 'satish', 'suresh', 'ramesh', 'naresh', 'mahesh', 'harish', 'rajesh',
  'rakesh', 'lokesh', 'venkatesh', 'venkat', 'venkata', 'sai', 'krishna', 'shiva', 'siva', 'vishnu',
  'prasad', 'durga', 'bhanu', 'ravi', 'teja', 'raghu', 'ram', 'rama', 'lakshman', 'bharath', 'bharat',
  'nagaraju', 'nagaraj', 'balaji', 'balajigowda', 'subrahmanyam', 'srinivas', 'srinivasa', 'murali',
  'sekhar', 'shekhar', 'chandra', 'jagadeesh', 'jagadish', 'sandeep', 'pradeep', 'sudheer', 'sudhir',
  'kiran', 'tarun', 'tharun', 'varun', 'nikhil', 'akhil', 'vamsi', 'vamshi', 'rohit', 'rohith', 'harsha',
  'uday', 'srikanth', 'srikant', 'ravikanth', 'ravikant', 'shashikanth', 'shashikant', 'charith', 'charan',
  'anirudh', 'abhinav', 'abhishek', 'gautham', 'gautam', 'goutham', 'gowtham', 'vikram', 'vijay', 'ajay',
  'sanjay', 'vinay', 'manoj', 'praveen', 'naveen', 'madhu', 'mohan', 'sohan', 'ashok', 'kishore',
  'anand', 'sampath', 'sumanth', 'shravan', 'karthik', 'kartheek', 'sukesh', 'upen', 'haranadh',
  'dileep', 'dilip', 'praneeth', 'pranay', 'prahas', 'puneeth', 'ruthvik', 'saikiran', 'saiteja',
  'shashank', 'shreyas', 'siddhardha', 'siddharth', 'sreekanth', 'suman', 'sunil', 'supreet', 'suprith',
  'surya', 'sushanth', 'tejas', 'trilok', 'vamsidhar', 'vasanth', 'vedant', 'veer', 'venkatram',
  'vidyadhar', 'vikas', 'vikramaditya', 'vinod', 'viraj', 'viren', 'vishrut', 'viswanath', 'yashwanth',
  'yashwant', 'yuvaraj', 'shyam', 'muralidhar', 'harinath', 'somesh', 'dharma', 'bhargav', 'chaitanya',
  'dhanush', 'hitesh', 'jayanth', 'kavish', 'lohith', 'manikanta', 'manishankar', 'mithun', 'mukesh',
  'naga', 'nandakishore', 'phani', 'prithviraj', 'raghavendra', 'rajashekar', 'ramakrishna', 'sai kiran',
  'sai krishna', 'sai ram', 'santosh', 'sarath', 'sreedhar', 'sridhar', 'srinatha', 'taraka', 'tirupathi',
  'vamsi krishna', 'veerendra', 'vijaya kumar', 'vinayak', 'vishnuvardhan', 'vineeth', 'vinith',
  'gopinadh', 'gopinath', 'aryan', 'sahil', 'vishal', 'ankith', 'nithin', 'suhas', 'suhaas', 'devansh',
  'satyam', 'preetham', 'prudhvi', 'pruthvi', 'kaushal', 'piyush', 'jaswanth', 'jaswant', 'dushyant',
  'neeraj', 'niraj', 'shivdev', 'dhanraj', 'fariz', 'mandar', 'pratheek', 'hemanth', 'harshavardhan',
  'prashanth', 'aravind', 'chandu', 'ganesh', 'palacharla', 'nishal', 'kamal', 'rutik', 'shaunak',
  'priyaank', 'mahanth', 'manas', 'chaithanya', 'satwik', 'dharmay', 'mahidhar', 'raghava', 'guru',
  'taha', 'udith', 'kasi', 'raianul', 'periyardhasan', 'vasudevarao', 'sairam', 'akshith', 'pranil',
  'sahas', 'saikrishna', 'febin', 'shivlal', 'dayanidhi', 'venkatasai', 'venkatakrishna', 'sivakrishna',
  'nagendra', 'srinivasan', 'narasimha', 'purushottam', 'venkataramana', 'chiranjeevi', 'balakrishna',
  'madhusudhan', 'suryanarayana', 'venkateswara', 'subrahmanya', 'chandrakanth', 'chandrasekhar',
  'paramesh', 'somasekhar', 'sudhakar', 'prabhakar', 'karunakar', 'diwakar', 'bhaskar', 'radhakrishna',
  'rajasekhar', 'ajith', 'chinmay', 'tanuj', 'harshit', 'sudeer', 'febrin', 'ashikur', 'kranthi',
  'amruth', 'jayant', 'jeet', 'kaushik', 'koushik',

  // Muslim / Middle Eastern / Urdu Tech & Healthcare
  'mohammed', 'mohammad', 'muhammad', 'mohd', 'hafeez', 'abdul', 'rehman', 'rahman', 'athaur',
  'mohsen', 'mohsin', 'omair', 'farhan', 'imran', 'tariq', 'salman', 'bilal', 'zaid', 'usman',
  'ali', 'ahmed', 'ahmad', 'hassan', 'hussain', 'hussein', 'omar', 'mustafa', 'ibrahim', 'rashid',
  'asif', 'adil', 'aamir', 'amir', 'junaid', 'faisal', 'rizwan', 'sohail', 'suhail', 'arsalan',
  'danish', 'kashif', 'shahrukh', 'shahid', 'khalid', 'naveed', 'waseem', 'wasim', 'azhar', 'shoaib',
  'zubair', 'hamza', 'irfan', 'sameer', 'samir', 'shabbir', 'shaukat', 'ayub', 'mansoor', 'tanveer',
  'tanvir', 'akram', 'ansar', 'arshad', 'ashraf', 'bashir', 'faiyaz', 'ghulam', 'habib', 'iqbal',
  'jahangir', 'kamran', 'liaquat', 'mahmood', 'naseem', 'pervez', 'qasim', 'rafiq', 'sajid', 'tahir',
  'waqar', 'yousuf', 'yusuf', 'zaheer', 'zia', 'syed', 'talha', 'idress', 'saifullah', 'maher', 'khaja',
  'zain', 'nisar', 'liban',

  // North / West / East Indian (Hindi, Punjabi, Marathi, Gujarati, Bengali)
  'rahul', 'rohan', 'amit', 'deepak', 'alok', 'gaurav', 'saurabh', 'sachin', 'nitin', 'ankit',
  'kunal', 'karan', 'arjun', 'aditya', 'dinesh', 'ashish', 'manish', 'chetan', 'hemant', 'pankaj',
  'sumit', 'arvind', 'krish', 'prashant', 'shashi', 'subhash', 'dev', 'dhruv', 'ishaan', 'kabir',
  'aarav', 'vihaan', 'ayush', 'aman', 'harsh', 'yash', 'pranav', 'rishabh', 'mayank', 'tanmay',
  'utkarsh', 'tushar', 'ayushman', 'shubham', 'priyanshu', 'sourabh', 'divyansh', 'parag', 'chirag',
  'hardik', 'parth', 'manan', 'bhavik', 'meet', 'dhairya', 'darshan', 'hiren', 'mehul', 'ketan',
  'jigar', 'ronak', 'anupam', 'anurag', 'aseem', 'bhupen', 'bipin', 'deven', 'dhiren', 'girish',
  'kamlesh', 'mangesh', 'nilesh', 'paresh', 'ritesh', 'rupesh', 'sailesh', 'shailesh', 'vipul',
  'yashpal', 'yogesh', 'akshay', 'amartya', 'aniket', 'arijit', 'arnab', 'ashutosh', 'avadhut',
  'chinmay', 'debabrata', 'deepanjan', 'devendra', 'dhananjay', 'dibyendu', 'digvijay', 'gurinder',
  'harbinder', 'harvinder', 'indrajit', 'jagjit', 'jaspreet', 'jaswinder', 'jeetendra', 'kuldeep',
  'mandeep', 'manpreet', 'navdeep', 'parminder', 'prabhat', 'pramod', 'rajat', 'ranjeet', 'ranjit',
  'ratnesh', 'ravindra', 'ripudaman', 'satyendra', 'shantanu', 'shouvik', 'sourav', 'subrata',
  'sudeep', 'sudipto', 'surinder', 'swapan', 'upendra', 'virendra',

  // Asian / Chinese / Vietnamese common
  'wei', 'ming', 'jian', 'hao', 'jun', 'chen', 'bo', 'lei', 'yong', 'qiang', 'feng', 'xin',
  'anh', 'binh', 'duy', 'hai', 'hung', 'khoa', 'long', 'minh', 'nam', 'phong', 'quang', 'sang', 'thanh', 'tuan'
]);

const FEMALE_NAMES = new Set([
  // Popular Western / International
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
  'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'emily', 'donna', 'michelle',
  'carol', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia', 'kathleen',
  'amy', 'angela', 'shirley', 'anna', 'brenda', 'pamela', 'nicole', 'emma', 'samantha', 'katherine',
  'christine', 'helen', 'debra', 'rachel', 'carolyn', 'janet', 'maria', 'marina', 'catherine', 'heather', 'diane',
  'olivia', 'julie', 'joyce', 'victoria', 'ruth', 'virginia', 'lauren', 'kelly', 'christina', 'joan',
  'evelyn', 'judith', 'andrea', 'hannah', 'megan', 'cheryl', 'jacqueline', 'martha', 'madison', 'teresa',
  'gloria', 'sara', 'janice', 'ann', 'kathryn', 'abigail', 'sophia', 'frances', 'jean', 'alice',
  'judy', 'isabella', 'julia', 'grace', 'amber', 'denise', 'danielle', 'marilyn', 'beverly', 'charlotte',
  'natalie', 'theresa', 'diana', 'brittany', 'doris', 'kayla', 'chloe', 'claire', 'elena', 'monica',
  'fiona', 'clara', 'valerie', 'alicia', 'paula', 'audrey', 'tara', 'tiffany', 'chelsea', 'melanie',
  'vanessa', 'leah', 'kaylee', 'savannah', 'katelyn', 'autumn', 'brooke', 'hailey', 'zoe', 'brianna',
  'morgan', 'paige', 'sydney', 'alexandra', 'allison', 'caroline', 'claudia', 'gabriella', 'jocelyn',

  // South Asian / Telugu / Tamil / South Indian Tech
  'devanshi', 'vagdevi', 'sahasra', 'aditi', 'amrutha', 'priya', 'pooja', 'neha', 'anjali', 'sneha',
  'swati', 'swathi', 'ritu', 'rutuja', 'divya', 'shweta', 'deepika', 'priyanka', 'sunita', 'sunitha', 'anita',
  'anitha', 'geeta', 'geetha', 'seema', 'rekha', 'kavita', 'kavitha', 'meena', 'asha', 'usha',
  'sangeeta', 'sangeetha', 'rashmi', 'shilpa', 'preeti', 'shruti', 'shruthi', 'tanvi', 'shreya',
  'rashi', 'pallavi', 'rupa', 'rupali', 'nisha', 'richa', 'chetna', 'jyoti', 'jyothi', 'vandana',
  'archana', 'bhavna', 'bhavana', 'payal', 'komal', 'aarti', 'simran', 'radha', 'sita', 'lakshmi',
  'parvathi', 'vidya', 'anu', 'ananya', 'diya', 'ishita', 'navya', 'saumya', 'sowmya', 'sonia',
  'megha', 'shikha', 'swarna', 'tejaswini', 'tejaswi', 'harika', 'mounika', 'keerthi', 'keerthana', 'sravanthi',
  'sravani', 'shravani', 'shravya', 'pranavi', 'lavanya', 'bhavani', 'supriya', 'anusha', 'sireesha', 'sirisha', 'madhuri',
  'gayathri', 'pranathi', 'hema', 'hemalatha', 'padmaja', 'padma', 'indira', 'roopa', 'sandhya',
  'saritha', 'sunanda', 'swapna', 'sushma', 'sushmitha', 'shailaja', 'uma', 'vani', 'vasantha', 'yamuna', 'akhila',
  'apoorva', 'ashwini', 'chandana', 'deepthi', 'harini', 'jahnavi', 'krithi', 'manasa', 'meghana',
  'nandini', 'niharika', 'pranitha', 'prathyusha', 'pratyusha', 'ramya', 'ramyasri', 'sahithi', 'sameera', 'sanjana',
  'sindhu', 'sindhuja', 'spoorthi', 'sreeja', 'srilatha', 'srividya', 'vaishnavi', 'varsha', 'vennela',
  'yamini', 'alekhya', 'anupama', 'aparna', 'aruna', 'asmita', 'avantika', 'bindu', 'charitha',
  'chaitra', 'deeksha', 'deepa', 'dhanalakshmi', 'dharani', 'dhivya', 'gowri', 'greeshma', 'hemamalini',
  'hiranmayi', 'jaya', 'kalpana', 'kalyani', 'kanchana', 'karuna', 'kowsalya', 'lalitha', 'madhavi',
  'malathi', 'mallika', 'manjula', 'meenakshi', 'mohana', 'mythili', 'nagalakshmi', 'nalini', 'narmada',
  'navaneetha', 'neeraja', 'nirmala', 'nithya', 'pavani', 'poornima', 'prabhavathi', 'prameela',
  'prasanna', 'prathibha', 'pravallika', 'prema', 'purnima', 'pushpa', 'rajeshwari', 'rajini',
  'renuka', 'rohini', 'sailaja', 'sarada', 'sarala', 'saraswathi', 'sarojini', 'sasikala', 'satyavathi',
  'savithri', 'shanthi', 'sharada', 'shobha', 'sobha', 'sravya', 'srilekha', 'subhashini', 'sudha',
  'sujatha', 'sukanya', 'sumalatha', 'sumathi', 'sunalini', 'suneetha', 'surekha', 'susheela', 'suvarna',
  'swarnalatha', 'tanuja', 'thanuja', 'thriveni', 'tulasi', 'udaya', 'ujwala', 'urmila', 'vasanthi',
  'vasudha', 'vedavathi', 'vijaya', 'vijayalakshmi', 'vimala', 'vineetha', 'visalakshi', 'yashoda',
  'anuradha', 'rashmika', 'deepshikha', 'monalisa', 'soundarya', 'sandhyarani',

  // Muslim / Middle Eastern / Urdu Tech & Healthcare
  'fatima', 'fatimah', 'aisha', 'ayesha', 'zainab', 'mariam', 'maryam', 'noor', 'layla', 'laila',
  'yasmin', 'yasmine', 'farah', 'samira', 'huda', 'asma', 'bushra', 'farzana', 'shabana', 'shagufta',
  'naheed', 'nasreen', 'parveen', 'rehana', 'rubina', 'rukhsana', 'saima', 'salma', 'sana', 'shazia',
  'sumaiya', 'tahira', 'uzma', 'zeenat', 'zoya', 'afshan', 'aneesa', 'arifa', 'fauzia', 'habiba',
  'haleema', 'haseena', 'iffat', 'ishrat', 'kalsoom', 'khadija', 'kulsoom', 'lubna', 'maheen',
  'madiha', 'munira', 'nabila', 'nargis', 'nazia', 'neelam', 'nusrat', 'rabia', 'raheela', 'razina',
  'sadia', 'saira', 'sameena', 'shahida', 'shama', 'shehnaz', 'sobia', 'tabassum', 'tasneem', 'yasmeen',

  // North / West / East Indian (Hindi, Punjabi, Marathi, Gujarati, Bengali)
  'ananya', 'ishita', 'sonia', 'shikha', 'harpreet', 'manpreet', 'gurpreet', 'jaspreet', 'navneet',
  'parminder', 'ravneet', 'surinder', 'shubhangi', 'swatika', 'tanushree', 'madhumita', 'mousumi',
  'sharmila', 'debashree', 'sarmistha', 'anushree', 'sayantani', 'baishali', 'ruma', 'tumpa',
  'payel', 'poly', 'shoma', 'monalisa', 'indrani', 'kalyanee', 'paramita', 'barnali', 'kasturi',

  // Asian / Chinese / Vietnamese common
  'fang', 'yan', 'ling', 'ting', 'li', 'hui', 'jing', 'xia', 'lan', 'mei', 'na', 'ping',
  'mai', 'lan', 'hoa', 'linh', 'nga', 'thu', 'trang', 'huong', 'ngoc', 'phuong', 'thao'
]);

// Strong Male Markers in Compound/Full Names
const MALE_COMPOUND_TOKENS = new Set([
  'kumar', 'reddy', 'swaroop', 'swarup', 'prasad', 'babu', 'teja', 'kalyan', 'gowda', 'naidu',
  'chowdary', 'raju', 'varma', 'shetty', 'singh', 'shaik', 'shaikh', 'khan', 'ahmed', 'mohammed',
  'mohd', 'rao', 'chandra', 'sekhar', 'shekhar', 'shankar', 'sankar', 'simha', 'narasimha', 'murthy',
  'moorthy', 'nathan', 'swamy', 'swami', 'narayana', 'deva', 'dev', 'nath', 'kant', 'kanth', 'deep',
  'patel', 'sharma', 'yadav', 'gupta', 'jain', 'joshi'
]);

// Strong Female Markers in Compound/Full Names
const FEMALE_COMPOUND_TOKENS = new Set([
  'kumari', 'devi', 'priya', 'sree', 'shree', 'latha', 'lata', 'vathi', 'vati', 'wati', 'amma',
  'rani', 'begum', 'bibi', 'khatoon', 'bai', 'ben', 'kaur', 'mani', 'shree', 'sri', 'bano'
]);

export interface DetectGenderOptions {
  rawGender?: string | null;
  firstName?: string | null;
  fullName?: string | null;
  notes?: string | null;
}

/**
 * World-Class Intelligent Gender Detection Engine
 * Accurately detects Male / Female across:
 * 1. Direct explicit values ('Male', 'Female', 'M', 'F', etc.)
 * 2. Honorific salutations ('Mr.', 'Ms.', 'Mrs.', 'Sir', 'Madam', 'Shri', 'Smt.')
 * 3. Structured recruiter screening notes & prefixes (e.g. "Female/1/OPT", "Female/Not Interested", "He is...", "She is...")
 * 4. Multi-token name scanning across extensive Western, South Asian (Telugu, Tamil, Hindi, etc.), and international lexicons
 * 5. Compound name indicators & cultural morphological suffix matching
 */
export function detectGender(
  rawGenderOrOptions?: string | null | DetectGenderOptions,
  firstNameArg?: string | null,
  fullNameArg?: string | null,
  notesArg?: string | null
): Gender {
  let rawGender: string | null = null;
  let firstName: string | null = null;
  let fullName: string | null = null;
  let notes: string | null = null;

  if (typeof rawGenderOrOptions === 'object' && rawGenderOrOptions !== null) {
    rawGender = rawGenderOrOptions.rawGender || null;
    firstName = rawGenderOrOptions.firstName || null;
    fullName = rawGenderOrOptions.fullName || null;
    notes = rawGenderOrOptions.notes || null;
  } else if (typeof rawGenderOrOptions === 'string') {
    const trimmed = rawGenderOrOptions.trim();
    // Check if the first parameter is an explicit gender word:
    if (/^(m|male|man|boy|he|he\/him|f|female|woman|girl|she|she\/her|o|other|non-binary|nb|they|they\/them|unspecified)$/i.test(trimmed)) {
      rawGender = trimmed;
      firstName = firstNameArg || null;
      fullName = fullNameArg || null;
      notes = notesArg || null;
    } else {
      // It's a full name passed as the single or first argument!
      fullName = trimmed;
      firstName = firstNameArg || null;
      notes = notesArg || null;
    }
  } else {
    firstName = firstNameArg || null;
    fullName = fullNameArg || null;
    notes = notesArg || null;
  }

  // 1. Explicit input column check
  if (rawGender) {
    const clean = rawGender.trim().toLowerCase();
    if (/^(m|male|man|boy|he|he\/him|gentleman)$/.test(clean)) return 'Male';
    if (/^(f|female|woman|girl|she|she\/her|lady)$/.test(clean)) return 'Female';
    if (/^(o|other|non-binary|nb|they|they\/them)$/.test(clean)) return 'Other';
    if (/^(mr|mr\.|shri|sir)$/.test(clean)) return 'Male';
    if (/^(ms|ms\.|mrs|mrs\.|miss|madam|smt|smt\.)$/.test(clean)) return 'Female';
  }

  // 2. Salutation check inside Full Name
  if (fullName) {
    const fnClean = fullName.trim().toLowerCase();
    if (/^(mr\.|mr\s+|shri\s+|sir\s+)/i.test(fnClean)) return 'Male';
    if (/^(ms\.|ms\s+|mrs\.|mrs\s+|miss\s+|smt\.|smt\s+|madam\s+)/i.test(fnClean)) return 'Female';
  }

  // 3. Screening notes / Feedback checks (High Priority for Recruiter Formats!)
  if (notes && typeof notes === 'string' && notes.trim().length > 0) {
    const noteTrimmed = notes.trim();
    const noteLower = noteTrimmed.toLowerCase();

    // 3a. Explicit Prefix check: "Female/...", "Female-...", "Female, ...", "Female Candidate"
    if (/^(female|girl|woman|lady)[\s/,:;-]/i.test(noteTrimmed) || /^female\b/i.test(noteTrimmed)) {
      return 'Female';
    }
    // 3b. Explicit "F/..." followed by age or screening notes: e.g. "F/1/OPT", "F/25/..."
    if (/^f\/(?:\d+|opt|h1b|cpt|visa|citizen|masters|open)/i.test(noteTrimmed)) {
      return 'Female';
    }

    // 3c. Explicit Prefix check: "Male/...", "Male-...", "Male Candidate"
    if (/^(male|boy|guy|man|gentleman)[\s/,:;-]/i.test(noteTrimmed) || /^male\b/i.test(noteTrimmed)) {
      return 'Male';
    }
    // 3d. Explicit "M/..." followed by age or screening notes (avoid matching 'M' for Masters or Married)
    if (/^m\/(?:\d+\+?\s*years?|opt|h1b|cpt|visa|citizen)/i.test(noteTrimmed)) {
      return 'Male';
    }

    // 3e. In-depth keyword / pronoun scanning
    const hasFemaleNote = /\b(female candidate|female|she is|she was|she's|her\b|girl\b|woman\b|lady\b|daughter\b|wife\b|mother\b)\b/i.test(noteLower);
    const hasMaleNote = /\b(male candidate|male|he is|he was|he's|his\b|boy\b|guy\b|gentleman\b|son\b|husband\b|father\b)\b/i.test(noteLower);

    if (hasFemaleNote && !hasMaleNote) return 'Female';
    if (hasMaleNote && !hasFemaleNote) return 'Male';
  }

  // 4. Multi-token name scanning & Compound Title analysis
  const nameToScan = (fullName || firstName || '').trim();
  if (nameToScan) {
    const rawTokens = nameToScan
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);

    if (rawTokens.length > 0) {
      // 4a. Special South Indian compound exceptions:
      // "Jyothi Swaroop" -> "Swaroop" is an explicit male compound name; "Jyothi Swaroop" is male!
      if (rawTokens.includes('swaroop') || rawTokens.includes('swarup')) {
        return 'Male';
      }
      if (rawTokens.includes('prasad') || rawTokens.includes('babu') || rawTokens.includes('kalyan')) {
        return 'Male';
      }

      let femaleScore = 0;
      let maleScore = 0;

      for (let i = 0; i < rawTokens.length; i++) {
        const token = rawTokens[i];

        // Direct Lexicon Match
        if (FEMALE_NAMES.has(token)) {
          femaleScore += (i === 0 ? 3 : 2);
        }
        if (MALE_NAMES.has(token)) {
          maleScore += (i === 0 ? 3 : 2);
        }

        // Compound Title Match
        if (FEMALE_COMPOUND_TOKENS.has(token)) {
          femaleScore += 4;
        }
        if (MALE_COMPOUND_TOKENS.has(token)) {
          maleScore += 4;
        }

        // Substring / Root match for compound names (e.g. 'balajigowda' -> 'balaji', 'saikiran' -> 'sai' + 'kiran')
        if (token.startsWith('balaji') || token.endsWith('gowda')) {
          maleScore += 3;
        }
        if (token.startsWith('saik') || token.startsWith('saiv') || token.startsWith('sair') || token.startsWith('sait') || token.startsWith('saip') || token.startsWith('saig') || token.startsWith('saic')) {
          maleScore += 3;
        }
        if (token.startsWith('satish') || token.startsWith('sateesh')) {
          maleScore += 3;
        }
        if (token.startsWith('siva') || token.startsWith('shiva') || token.startsWith('rama') || token.startsWith('venkat') || token.startsWith('sudheer') || token.startsWith('hari') || token.startsWith('guru')) {
          maleScore += 2;
        }
        if (token.endsWith('kumar') || token.endsWith('kumaar')) {
          maleScore += 4;
        }
        if (token.endsWith('nadh') || token.endsWith('nath')) {
          maleScore += 3;
        }
        if (token.endsWith('reddy') || token.endsWith('naidu') || token.endsWith('chowdary') || token.endsWith('raju') || token.endsWith('varma') || token.includes('reddy') || token.includes('chowdary')) {
          maleScore += 3;
        }
        if (token.endsWith('kumari') || token.endsWith('devi') || token.endsWith('latha') || token.endsWith('vathi') || token.endsWith('wati') || token.endsWith('priya') || token.endsWith('shree') || token.endsWith('sree')) {
          femaleScore += 4;
        }
      }

      if (femaleScore > maleScore && femaleScore >= 2) return 'Female';
      if (maleScore > femaleScore && maleScore >= 2) return 'Male';

      // 4b. Morphological suffix heuristics for South Asian & International names
      const primaryToken = rawTokens[0]; // Candidate's given first name

      // South Asian Male Endings: -esh (Ramesh, Suresh, Rajesh, Sateesh), -ender (Narender), -deep (Sandeep), -kanth (Srikanth)
      if (
        primaryToken.endsWith('esh') ||
        primaryToken.endsWith('eysh') ||
        primaryToken.endsWith('ender') ||
        primaryToken.endsWith('endra') ||
        primaryToken.endsWith('deep') ||
        primaryToken.endsWith('kanth') ||
        primaryToken.endsWith('kant') ||
        primaryToken.endsWith('nath') ||
        primaryToken.endsWith('nadh') ||
        primaryToken.endsWith('sekhar') ||
        primaryToken.endsWith('shekhar') ||
        primaryToken.endsWith('teja') ||
        primaryToken.endsWith('babu') ||
        primaryToken.endsWith('singh') ||
        primaryToken.endsWith('anth') ||
        primaryToken.endsWith('wanth') ||
        primaryToken.endsWith('eeth') ||
        primaryToken.endsWith('ith') ||
        primaryToken.endsWith('raj')
      ) {
        return 'Male';
      }

      // South Asian Female Endings: -devi, -kumari, -priya, -shree, -sree, -vathi, -amrutha, -deepika, -mounika, -harika, -swathi, -keerthi
      if (
        primaryToken.endsWith('devi') ||
        primaryToken.endsWith('kumari') ||
        primaryToken.endsWith('priya') ||
        primaryToken.endsWith('shree') ||
        primaryToken.endsWith('sree') ||
        primaryToken.endsWith('vathi') ||
        primaryToken.endsWith('wati') ||
        primaryToken.endsWith('latha') ||
        primaryToken.endsWith('lata') ||
        primaryToken.endsWith('amrutha') ||
        primaryToken.endsWith('deepika') ||
        primaryToken.endsWith('mounika') ||
        primaryToken.endsWith('harika') ||
        primaryToken.endsWith('swathi') ||
        primaryToken.endsWith('keerthi') ||
        primaryToken.endsWith('lavanya') ||
        primaryToken.endsWith('bhavani') ||
        primaryToken.endsWith('anusha') ||
        primaryToken.endsWith('sowmya') ||
        primaryToken.endsWith('divya') ||
        primaryToken.endsWith('shravani') ||
        primaryToken.endsWith('tejaswini') ||
        primaryToken.endsWith('manasa') ||
        primaryToken.endsWith('sahithi') ||
        primaryToken.endsWith('pranitha') ||
        primaryToken.endsWith('kavitha') ||
        primaryToken.endsWith('sunitha') ||
        primaryToken.endsWith('geetha') ||
        primaryToken.endsWith('anitha') ||
        primaryToken.endsWith('archana') ||
        primaryToken.endsWith('vandana') ||
        primaryToken.endsWith('bhavana') ||
        primaryToken.endsWith('kalpana')
      ) {
        return 'Female';
      }
    }
  }

  return 'Unspecified';
}
